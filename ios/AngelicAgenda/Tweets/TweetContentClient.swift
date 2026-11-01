import Foundation

protocol TweetContentClientProtocol: Sendable {
    func fetchLatest(
        baseURL: URL,
        setupToken: String,
        limit: Int
    ) async throws -> [TweetContent]
}

enum TweetContentClientError: LocalizedError, Equatable {
    case missingSetupToken
    case invalidLimit
    case invalidResponse
    case serverError(statusCode: Int)
    case invalidData

    var errorDescription: String? {
        switch self {
        case .missingSetupToken:
            "セットアップトークンが設定されていません。アプリを再ビルドしてください。"
        case .invalidLimit:
            "取得件数の指定が不正です。"
        case .invalidResponse:
            "サーバーから正しい応答を受け取れませんでした。"
        case .serverError(let statusCode):
            "告知を取得できませんでした（HTTP \(statusCode)）。"
        case .invalidData:
            "受信した告知データを読み取れませんでした。"
        }
    }
}

struct TweetContentClient: TweetContentClientProtocol {
    private let urlSession: URLSession

    init(urlSession: URLSession = TweetContentClient.makeEphemeralSession()) {
        self.urlSession = urlSession
    }

    func fetchLatest(
        baseURL: URL,
        setupToken: String,
        limit: Int = 50
    ) async throws -> [TweetContent] {
        let trimmedToken = setupToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedToken.isEmpty else {
            throw TweetContentClientError.missingSetupToken
        }
        guard (1...100).contains(limit) else {
            throw TweetContentClientError.invalidLimit
        }

        let endpoint = baseURL.appendingPathComponent("tweets")
        guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else {
            throw TweetContentClientError.invalidResponse
        }
        components.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        guard let url = components.url else {
            throw TweetContentClientError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("Bearer \(trimmedToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await urlSession.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw TweetContentClientError.invalidResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            throw TweetContentClientError.serverError(statusCode: response.statusCode)
        }

        do {
            return try Self.makeDecoder().decode([TweetContent].self, from: data)
        } catch {
            throw TweetContentClientError.invalidData
        }
    }

    private static func makeEphemeralSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        return URLSession(configuration: configuration)
    }

    private static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)

            let fractionalFormatter = ISO8601DateFormatter()
            fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractionalFormatter.date(from: value) {
                return date
            }

            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: value) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO 8601 date"
            )
        }
        return decoder
    }
}
