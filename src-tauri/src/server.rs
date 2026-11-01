use crate::store::{self, NewSave};
use crate::Db;
use tiny_http::{Header, Method, Response, Server};

/// Fixed local port the Chrome extension is configured to POST to. Only ever
/// bound to 127.0.0.1, never the network interface.
pub const PORT: u16 = 47615;

pub fn spawn(db: Db, token: String) {
    std::thread::spawn(move || {
        let server = match Server::http(("127.0.0.1", PORT)) {
            Ok(s) => s,
            Err(e) => {
                log::error!("local server failed to bind 127.0.0.1:{PORT}: {e}");
                return;
            }
        };
        log::info!("local server listening on 127.0.0.1:{PORT}");

        for mut request in server.incoming_requests() {
            let response = handle(&mut request, &db, &token);
            let _ = request.respond(response);
        }
    });
}

fn handle(
    request: &mut tiny_http::Request,
    db: &Db,
    token: &str,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let authorized = request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("Authorization"))
        .map(|h| h.value.as_str() == format!("Bearer {token}"))
        .unwrap_or(false);

    if !authorized {
        return json_response(401, br#"{"error":"unauthorized"}"#.to_vec());
    }

    let url = request.url().to_string();
    let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));

    if request.method() == &Method::Get && path == "/saves" {
        let limit: i64 = query
            .split('&')
            .find_map(|p| p.strip_prefix("limit="))
            .and_then(|v| v.parse().ok())
            .unwrap_or(10);

        let conn = match db.lock() {
            Ok(c) => c,
            Err(_) => return json_response(500, br#"{"error":"db lock poisoned"}"#.to_vec()),
        };
        return match store::list_recent_saves(&conn, limit) {
            Ok(saves) => json_response(200, serde_json::to_vec(&saves).unwrap_or_default()),
            Err(e) => json_response(500, format!(r#"{{"error":"{e}"}}"#).into_bytes()),
        };
    }

    if request.method() != &Method::Post || path != "/saves" {
        return json_response(404, br#"{"error":"not found"}"#.to_vec());
    }

    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        return json_response(400, br#"{"error":"invalid body"}"#.to_vec());
    }

    let input: NewSave = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let msg = format!(r#"{{"error":"invalid json: {e}"}}"#);
            return json_response(400, msg.into_bytes());
        }
    };

    let conn = match db.lock() {
        Ok(c) => c,
        Err(_) => return json_response(500, br#"{"error":"db lock poisoned"}"#.to_vec()),
    };

    match store::create_save(&conn, &input) {
        Ok(save) => {
            let body = serde_json::to_vec(&save).unwrap_or_default();
            json_response(200, body)
        }
        Err(e) => {
            let msg = format!(r#"{{"error":"{e}"}}"#);
            json_response(500, msg.into_bytes())
        }
    }
}

fn json_response(status: u16, body: Vec<u8>) -> Response<std::io::Cursor<Vec<u8>>> {
    let header = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    Response::from_data(body)
        .with_status_code(status)
        .with_header(header)
}
