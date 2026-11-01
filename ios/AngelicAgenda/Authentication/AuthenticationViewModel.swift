import Combine
import Foundation

struct XWebSessionCredentials: Equatable, Sendable {
    let authToken: String
    let ct0: String
}

enum AngelicServerConfiguration {
    static let baseURL: URL = {
        guard let url = URL(string: "https://agenda-api.takajirou.app") else {
            preconditionFailure("固定された外部サーバーURLが不正です。")
        }
        return url
    }()
}

struct AppUser: Codable, Equatable, Sendable {
    let id: String
    let email: String
}

struct AppSession: Codable, Equatable, Sendable {
    let token: String
    let expiresAt: Date
    let user: AppUser
}

enum AuthenticationError: LocalizedError, Equatable {
    case invalidEmail
    case invalidPassword
    case invalidResponse
    case serverError(statusCode: Int, message: String?)
    case sessionReadFailed
    case sessionSaveFailed
    case sessionDeleteFailed

    var errorDescription: String? {
        switch self {
        case .invalidEmail:
            "メールアドレスを確認してください。"
        case .invalidPassword:
            "パスワードは12〜128文字で入力してください。"
        case .invalidResponse:
            "サーバーから正しい応答を受け取れませんでした。"
        case .serverError(_, let message):
            message ?? "サーバーへの接続に失敗しました。"
        case .sessionReadFailed:
            "保存済みのログイン情報を読み込めませんでした。"
        case .sessionSaveFailed:
            "ログイン情報を安全に保存できませんでした。"
        case .sessionDeleteFailed:
            "ログイン情報を削除できませんでした。"
        }
    }
}

@MainActor
final class AuthenticationViewModel: ObservableObject {
    @Published private(set) var session: AppSession?
    @Published private(set) var isXConnected: Bool?
    @Published private(set) var isWorking = false
    @Published private(set) var errorMessage: String?

    private let authClient: AppAuthClientProtocol
    private let xClient: XSessionProvisioningClientProtocol
    private let sessionStore: AppSessionStoreProtocol

    convenience init() {
        self.init(
            authClient: AppAuthClient(),
            xClient: XSessionProvisioningClient(),
            sessionStore: KeychainAppSessionStore()
        )
    }

    init(
        authClient: AppAuthClientProtocol,
        xClient: XSessionProvisioningClientProtocol,
        sessionStore: AppSessionStoreProtocol
    ) {
        self.authClient = authClient
        self.xClient = xClient
        self.sessionStore = sessionStore
        do {
            let stored = try sessionStore.load()
            if let stored, stored.expiresAt > Date() {
                session = stored
            } else if stored != nil {
                try sessionStore.delete()
            }
        } catch {
            errorMessage = AuthenticationError.sessionReadFailed.localizedDescription
        }
    }

    func register(email: String, password: String) async {
        await authenticate(email: email, password: password, mode: .register)
    }

    func login(email: String, password: String) async {
        await authenticate(email: email, password: password, mode: .login)
    }

    func refreshXConnection() async {
        guard let session, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            isXConnected = try await xClient.isConnected(authToken: session.token)
        } catch {
            if isUnauthorized(error) {
                clearLocalSession()
            } else {
                isXConnected = false
                handle(error)
            }
        }
    }

    func connectX(credentials: XWebSessionCredentials) async -> Bool {
        guard let session, !isWorking else { return false }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await xClient.provision(credentials: credentials, authToken: session.token)
            isXConnected = true
            return true
        } catch {
            if isUnauthorized(error) { clearLocalSession() }
            else { handle(error) }
            return false
        }
    }

    func disconnectX() async {
        guard let session, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await xClient.disconnect(authToken: session.token)
            isXConnected = false
        } catch {
            if isUnauthorized(error) { clearLocalSession() }
            else { handle(error) }
        }
    }

    func logout() async {
        guard let session else { return }
        isWorking = true
        defer { isWorking = false }
        try? await authClient.logout(authToken: session.token)
        clearLocalSession()
    }

    func deleteAccount() async {
        guard let session, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await authClient.deleteAccount(authToken: session.token)
            clearLocalSession()
        } catch {
            if isUnauthorized(error) { clearLocalSession() }
            else { handle(error) }
        }
    }

    func invalidateSession() {
        clearLocalSession()
    }

    func clearError() {
        errorMessage = nil
    }

    private func authenticate(email: String, password: String, mode: AppAuthMode) async {
        guard !isWorking else { return }
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalizedEmail.contains("@") else {
            handle(AuthenticationError.invalidEmail)
            return
        }
        guard (12...128).contains(password.count) else {
            handle(AuthenticationError.invalidPassword)
            return
        }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let newSession = try await authClient.authenticate(
                email: normalizedEmail,
                password: password,
                mode: mode
            )
            try sessionStore.save(newSession)
            session = newSession
            isXConnected = nil
        } catch {
            handle(error)
        }
    }

    private func clearLocalSession() {
        let deletionFailed: Bool
        do {
            try sessionStore.delete()
            deletionFailed = false
        } catch {
            deletionFailed = true
        }
        session = nil
        isXConnected = nil
        errorMessage = deletionFailed
            ? AuthenticationError.sessionDeleteFailed.localizedDescription
            : nil
    }

    private func isUnauthorized(_ error: Error) -> Bool {
        guard let authenticationError = error as? AuthenticationError,
              case .serverError(let statusCode, _) = authenticationError else {
            return false
        }
        return statusCode == 401
    }

    private func handle(_ error: Error) {
        errorMessage = (error as? LocalizedError)?.errorDescription
            ?? "時間をおいて、もう一度お試しください。"
    }
}
