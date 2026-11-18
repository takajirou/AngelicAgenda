import Foundation

protocol TweetFilterSettingsClientProtocol: Sendable {
    func fetch(baseURL: URL, authToken: String) async throws -> TweetFilterSettings
    func save(
        _ settings: TweetFilterSettings,
        baseURL: URL,
        authToken: String
    ) async throws -> TweetFilterSettings
}

enum TweetFilterSettingsClientError: LocalizedError, Equatable {
    case missingAuthToken
    case invalidResponse
    case serverError(statusCode: Int)
    case invalidData

    var errorDescription: String? {
        switch self {
        case .missingAuthToken:
            "ログイン情報がありません。もう一度ログインしてください。"
        case .invalidResponse:
            "サーバーから正しい応答を受け取れませんでした。"
        case .serverError(let statusCode):
            "絞り込み設定を更新できませんでした（HTTP \(statusCode)）。"
        case .invalidData:
            "受信した絞り込み設定を読み取れませんでした。"
        }
    }
}

struct TweetFilterSettingsClient: TweetFilterSettingsClientProtocol {
    private let urlSession: URLSession

    init(urlSession: URLSession = TweetFilterSettingsClient.makeEphemeralSession()) {
        self.urlSession = urlSession
    }

    func fetch(baseURL: URL, authToken: String) async throws -> TweetFilterSettings {
        let request = try makeRequest(
            baseURL: baseURL,
            authToken: authToken,
            method: "GET"
        )
        return try await execute(request)
    }

    func save(
        _ settings: TweetFilterSettings,
        baseURL: URL,
        authToken: String
    ) async throws -> TweetFilterSettings {
        var request = try makeRequest(
            baseURL: baseURL,
            authToken: authToken,
            method: "PUT"
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(settings)
        return try await execute(request)
    }

    private func makeRequest(
        baseURL: URL,
        authToken: String,
        method: String
    ) throws -> URLRequest {
        let token = authToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else {
            throw TweetFilterSettingsClientError.missingAuthToken
        }

        let endpoint = baseURL.appendingPathComponent("tweet-filter-settings")
        var request = URLRequest(url: endpoint)
        request.httpMethod = method
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func execute(_ request: URLRequest) async throws -> TweetFilterSettings {
        let (data, response) = try await urlSession.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw TweetFilterSettingsClientError.invalidResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            throw TweetFilterSettingsClientError.serverError(statusCode: response.statusCode)
        }
        do {
            return try JSONDecoder().decode(TweetFilterSettings.self, from: data)
        } catch {
            throw TweetFilterSettingsClientError.invalidData
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
