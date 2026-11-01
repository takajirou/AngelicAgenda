import Foundation

enum AppAuthMode: Equatable, Sendable {
    case login
    case register

    var path: String {
        switch self {
        case .login: "login"
        case .register: "register"
        }
    }
}

protocol AppAuthClientProtocol: Sendable {
    func authenticate(email: String, password: String, mode: AppAuthMode) async throws -> AppSession
    func logout(authToken: String) async throws
    func deleteAccount(authToken: String) async throws
}

struct AppAuthClient: AppAuthClientProtocol {
    private let session: URLSession

    init(session: URLSession = AppAuthClient.makeSession()) {
        self.session = session
    }

    func authenticate(
        email: String,
        password: String,
        mode: AppAuthMode
    ) async throws -> AppSession {
        var request = URLRequest(
            url: AngelicServerConfiguration.baseURL
                .appendingPathComponent("auth")
                .appendingPathComponent(mode.path)
        )
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(Credentials(email: email, password: password))
        let data = try await perform(request)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: value) { return date }
            let standard = ISO8601DateFormatter()
            standard.formatOptions = [.withInternetDateTime]
            if let date = standard.date(from: value) { return date }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO 8601 date"
            )
        }
        guard let response = try? decoder.decode(AppSession.self, from: data) else {
            throw AuthenticationError.invalidResponse
        }
        return response
    }

    func logout(authToken: String) async throws {
        try await performAuthenticated(path: "auth/logout", method: "POST", authToken: authToken)
    }

    func deleteAccount(authToken: String) async throws {
        try await performAuthenticated(path: "auth/account", method: "DELETE", authToken: authToken)
    }

    private func performAuthenticated(path: String, method: String, authToken: String) async throws {
        var request = URLRequest(url: AngelicServerConfiguration.baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        _ = try await perform(request)
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw AuthenticationError.invalidResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.displayMessage
            throw AuthenticationError.serverError(statusCode: response.statusCode, message: message)
        }
        return data
    }

    private static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        return URLSession(configuration: configuration)
    }
}

private struct Credentials: Encodable {
    let email: String
    let password: String
}

struct ServerError: Decodable {
    let message: Message

    enum Message: Decodable {
        case text(String)
        case list([String])

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let text = try? container.decode(String.self) { self = .text(text) }
            else { self = .list(try container.decode([String].self)) }
        }
    }

    var displayMessage: String {
        switch message {
        case .text(let text): text
        case .list(let values): values.joined(separator: "\n")
        }
    }
}
