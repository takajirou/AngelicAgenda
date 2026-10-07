import Foundation

protocol XSessionProvisioningClientProtocol: Sendable {
    func provision(
        credentials: XWebSessionCredentials,
        settings: AngelicServerSettings
    ) async throws
}

struct XSessionProvisioningClient: XSessionProvisioningClientProtocol {
    private let urlSession: URLSession

    init(urlSession: URLSession = XSessionProvisioningClient.makeEphemeralSession()) {
        self.urlSession = urlSession
    }

    func provision(
        credentials: XWebSessionCredentials,
        settings: AngelicServerSettings
    ) async throws {
        let endpoint = settings.baseURL
            .appendingPathComponent("integrations")
            .appendingPathComponent("angelic-angel")
            .appendingPathComponent("session")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 75
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(settings.setupToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(
            ProvisionRequest(authToken: credentials.authToken, ct0: credentials.ct0)
        )

        let (data, response) = try await urlSession.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw AuthenticationError.invalidResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            let errorResponse = try? JSONDecoder().decode(ServerErrorResponse.self, from: data)
            throw AuthenticationError.serverError(
                statusCode: response.statusCode,
                message: errorResponse?.displayMessage
            )
        }

        guard
            let provisionResponse = try? JSONDecoder().decode(ProvisionResponse.self, from: data),
            provisionResponse.status == "registered"
        else {
            throw AuthenticationError.invalidResponse
        }
    }

    private static func makeEphemeralSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        return URLSession(configuration: configuration)
    }
}

private struct ProvisionRequest: Encodable {
    let authToken: String
    let ct0: String
}

private struct ProvisionResponse: Decodable {
    let status: String
}

private struct ServerErrorResponse: Decodable {
    let message: Message

    enum Message: Decodable {
        case text(String)
        case list([String])

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let text = try? container.decode(String.self) {
                self = .text(text)
            } else {
                self = .list(try container.decode([String].self))
            }
        }
    }

    var displayMessage: String {
        switch message {
        case .text(let text): text
        case .list(let messages): messages.joined(separator: "\n")
        }
    }
}
