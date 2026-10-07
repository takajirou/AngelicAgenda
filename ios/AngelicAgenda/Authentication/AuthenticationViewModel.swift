import Combine
import Foundation

struct XWebSessionCredentials: Equatable, Sendable {
    let authToken: String
    let ct0: String
}

struct AngelicServerSettings: Equatable, Sendable {
    let baseURL: URL
    let setupToken: String
}

struct AngelicConnection: Codable, Equatable, Sendable {
    let serverURL: URL
    let connectedAt: Date
}

enum AuthenticationError: LocalizedError, Equatable {
    case invalidServerURL
    case insecureServerURL
    case missingSetupToken
    case invalidSetupToken
    case missingCookies
    case invalidResponse
    case serverError(statusCode: Int, message: String?)
    case connectionReadFailed
    case connectionSaveFailed
    case connectionDeleteFailed

    var errorDescription: String? {
        switch self {
        case .invalidServerURL:
            "外部サーバーのURLが正しくありません。"
        case .insecureServerURL:
            "Cookieを安全に送るため、サーバーURLにはHTTPSが必要です。"
        case .missingSetupToken:
            "サーバーのセットアップトークンを入力してください。"
        case .invalidSetupToken:
            "セットアップトークンは空白を含まない32〜512文字で入力してください。"
        case .missingCookies:
            "Xのログイン情報を確認できませんでした。Xへのログイン完了後にもう一度お試しください。"
        case .invalidResponse:
            "外部サーバーから正しい応答を受け取れませんでした。"
        case .serverError(_, let message):
            message ?? "外部サーバーへの接続に失敗しました。"
        case .connectionReadFailed:
            "保存済みの接続情報を読み込めませんでした。"
        case .connectionSaveFailed:
            "接続状態を安全に保存できませんでした。"
        case .connectionDeleteFailed:
            "接続情報を削除できませんでした。"
        }
    }
}

@MainActor
final class AuthenticationViewModel: ObservableObject {
    @Published private(set) var connection: AngelicConnection?
    @Published private(set) var isConnecting = false
    @Published private(set) var errorMessage: String?

    private let client: XSessionProvisioningClientProtocol
    private let connectionStore: AngelicConnectionStoreProtocol

    convenience init() {
        self.init(
            client: XSessionProvisioningClient(),
            connectionStore: KeychainAngelicConnectionStore()
        )
    }

    init(
        client: XSessionProvisioningClientProtocol,
        connectionStore: AngelicConnectionStoreProtocol
    ) {
        self.client = client
        self.connectionStore = connectionStore

        do {
            connection = try connectionStore.load()
        } catch {
            errorMessage = AuthenticationError.connectionReadFailed.localizedDescription
        }
    }

    func validateSettings(baseURLText: String, setupToken: String) throws -> AngelicServerSettings {
        let trimmedURL = baseURLText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            let url = URL(string: trimmedURL),
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            components.host != nil,
            components.user == nil,
            components.password == nil,
            components.query == nil,
            components.fragment == nil
        else {
            throw AuthenticationError.invalidServerURL
        }
        guard components.scheme?.lowercased() == "https" else {
            throw AuthenticationError.insecureServerURL
        }

        let trimmedToken = setupToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedToken.isEmpty else {
            throw AuthenticationError.missingSetupToken
        }
        guard
            (32...512).contains(trimmedToken.count),
            trimmedToken.unicodeScalars.allSatisfy({ scalar in
                !CharacterSet.whitespacesAndNewlines.contains(scalar)
                    && !CharacterSet.controlCharacters.contains(scalar)
            })
        else {
            throw AuthenticationError.invalidSetupToken
        }

        return AngelicServerSettings(baseURL: url, setupToken: trimmedToken)
    }

    func connect(
        credentials: XWebSessionCredentials,
        settings: AngelicServerSettings
    ) async -> Bool {
        guard !isConnecting else { return false }

        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }

        do {
            try await client.provision(credentials: credentials, settings: settings)
            let connection = AngelicConnection(serverURL: settings.baseURL, connectedAt: Date())
            try connectionStore.save(connection)
            self.connection = connection
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "時間をおいて、もう一度お試しください。"
            return false
        }
    }

    func setError(_ error: Error) {
        errorMessage = (error as? LocalizedError)?.errorDescription
            ?? "時間をおいて、もう一度お試しください。"
    }

    func signOut() {
        do {
            try connectionStore.delete()
            connection = nil
            errorMessage = nil
        } catch {
            errorMessage = AuthenticationError.connectionDeleteFailed.localizedDescription
        }
    }

    func clearError() {
        errorMessage = nil
    }

    static func preview(connected: Bool = true) -> AuthenticationViewModel {
        AuthenticationViewModel(
            client: PreviewProvisioningClient(),
            connectionStore: PreviewConnectionStore(
                connection: connected
                    ? AngelicConnection(
                        serverURL: URL(string: "https://agenda.example.com")!,
                        connectedAt: Date()
                    )
                    : nil
            )
        )
    }
}

private struct PreviewProvisioningClient: XSessionProvisioningClientProtocol {
    func provision(
        credentials: XWebSessionCredentials,
        settings: AngelicServerSettings
    ) async throws {}
}

private final class PreviewConnectionStore: AngelicConnectionStoreProtocol {
    private var connection: AngelicConnection?

    init(connection: AngelicConnection?) {
        self.connection = connection
    }

    func load() throws -> AngelicConnection? { connection }
    func save(_ connection: AngelicConnection) throws { self.connection = connection }
    func delete() throws { connection = nil }
}
