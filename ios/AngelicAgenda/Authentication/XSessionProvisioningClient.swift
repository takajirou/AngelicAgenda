import Foundation

protocol XSessionProvisioningClientProtocol: Sendable {
    func provision(credentials: XWebSessionCredentials, authToken: String) async throws
    func isConnected(authToken: String) async throws -> Bool
    func disconnect(authToken: String) async throws
}

struct XSessionProvisioningClient: XSessionProvisioningClientProtocol {
    private let urlSession: URLSession

    init(urlSession: URLSession = XSessionProvisioningClient.makeSession()) {
        self.urlSession = urlSession
    }

    func provision(credentials: XWebSessionCredentials, authToken: String) async throws {
        var request = makeRequest(method: "POST", authToken: authToken)
        request.timeoutInterval = 75
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            ProvisionRequest(authToken: credentials.authToken, ct0: credentials.ct0)
        )
        let data = try await perform(request)
        guard let response = try? JSONDecoder().decode(ProvisionResponse.self, from: data),
              response.status == "registered" else {
            throw AuthenticationError.invalidResponse
        }
    }

    func isConnected(authToken: String) async throws -> Bool {
        let data = try await perform(makeRequest(method: "GET", authToken: authToken))
        guard let response = try? JSONDecoder().decode(StatusResponse.self, from: data) else {
            throw AuthenticationError.invalidResponse
        }
        return response.connected
    }

    func disconnect(authToken: String) async throws {
        _ = try await perform(makeRequest(method: "DELETE", authToken: authToken))
    }

    private func makeRequest(method: String, authToken: String) -> URLRequest {
        let url = AngelicServerConfiguration.baseURL
            .appendingPathComponent("integrations")
            .appendingPathComponent("angelic-angel")
            .appendingPathComponent("session")
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await urlSession.data(for: request)
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

private struct ProvisionRequest: Encodable {
    let authToken: String
    let ct0: String
}

private struct ProvisionResponse: Decodable { let status: String }
private struct StatusResponse: Decodable { let connected: Bool }
