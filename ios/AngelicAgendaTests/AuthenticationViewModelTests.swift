import XCTest
@testable import AngelicAgenda

@MainActor
final class AuthenticationViewModelTests: XCTestCase {
    func testLoginStoresReturnedSession() async {
        let expected = makeSession()
        let authClient = AppAuthClientSpy(result: .success(expected))
        let store = AppSessionStoreSpy()
        let subject = AuthenticationViewModel(
            authClient: authClient,
            xClient: XSessionClientSpy(),
            sessionStore: store
        )

        await subject.login(email: "user@example.com", password: "password-1234")

        XCTAssertEqual(subject.session, expected)
        XCTAssertEqual(store.savedSession, expected)
        XCTAssertNil(subject.errorMessage)
        XCTAssertEqual(authClient.receivedMode, .login)
    }

    func testRegisterUsesRegistrationEndpoint() async {
        let authClient = AppAuthClientSpy(result: .success(makeSession()))
        let subject = AuthenticationViewModel(
            authClient: authClient,
            xClient: XSessionClientSpy(),
            sessionStore: AppSessionStoreSpy()
        )

        await subject.register(email: "user@example.com", password: "password-1234")

        XCTAssertEqual(authClient.receivedMode, .register)
    }

    func testConnectXUsesCurrentUserToken() async {
        let xClient = XSessionClientSpy()
        let subject = AuthenticationViewModel(
            authClient: AppAuthClientSpy(result: .success(makeSession())),
            xClient: xClient,
            sessionStore: AppSessionStoreSpy(session: makeSession())
        )
        let credentials = XWebSessionCredentials(
            authToken: String(repeating: "a", count: 32),
            ct0: String(repeating: "b", count: 32)
        )

        let succeeded = await subject.connectX(credentials: credentials)

        XCTAssertTrue(succeeded)
        XCTAssertTrue(subject.isXConnected == true)
        XCTAssertEqual(xClient.receivedCredentials, credentials)
        XCTAssertEqual(xClient.receivedAuthToken, "session-token")
    }

    func testLogoutRevokesServerSessionAndClearsKeychain() async {
        let authClient = AppAuthClientSpy(result: .success(makeSession()))
        let store = AppSessionStoreSpy(session: makeSession())
        let subject = AuthenticationViewModel(
            authClient: authClient,
            xClient: XSessionClientSpy(),
            sessionStore: store
        )

        await subject.logout()

        XCTAssertNil(subject.session)
        XCTAssertTrue(store.didDelete)
        XCTAssertEqual(authClient.revokedToken, "session-token")
    }

    func testUnauthorizedXStatusClearsLocalSession() async {
        let xClient = XSessionClientSpy()
        xClient.statusError = AuthenticationError.serverError(statusCode: 401, message: nil)
        let store = AppSessionStoreSpy(session: makeSession())
        let subject = AuthenticationViewModel(
            authClient: AppAuthClientSpy(result: .success(makeSession())),
            xClient: xClient,
            sessionStore: store
        )

        await subject.refreshXConnection()

        XCTAssertNil(subject.session)
        XCTAssertTrue(store.didDelete)
    }

    func testInvalidationClearsMemoryWhenKeychainDeletionFails() {
        let store = AppSessionStoreSpy(
            session: makeSession(),
            deleteError: AuthenticationError.sessionDeleteFailed
        )
        let subject = AuthenticationViewModel(
            authClient: AppAuthClientSpy(result: .success(makeSession())),
            xClient: XSessionClientSpy(),
            sessionStore: store
        )

        subject.invalidateSession()

        XCTAssertNil(subject.session)
        XCTAssertEqual(
            subject.errorMessage,
            AuthenticationError.sessionDeleteFailed.localizedDescription
        )
    }

    private func makeSession() -> AppSession {
        AppSession(
            token: "session-token",
            expiresAt: Date().addingTimeInterval(3_600),
            user: AppUser(id: "user-id", email: "user@example.com")
        )
    }
}

private final class AppAuthClientSpy: AppAuthClientProtocol, @unchecked Sendable {
    let result: Result<AppSession, Error>
    private(set) var receivedMode: AppAuthMode?
    private(set) var revokedToken: String?

    init(result: Result<AppSession, Error>) { self.result = result }

    func authenticate(email: String, password: String, mode: AppAuthMode) async throws -> AppSession {
        receivedMode = mode
        return try result.get()
    }

    func logout(authToken: String) async throws { revokedToken = authToken }
    func deleteAccount(authToken: String) async throws {}
}

private final class XSessionClientSpy: XSessionProvisioningClientProtocol, @unchecked Sendable {
    private(set) var receivedCredentials: XWebSessionCredentials?
    private(set) var receivedAuthToken: String?
    var connected = false
    var statusError: Error?

    func provision(credentials: XWebSessionCredentials, authToken: String) async throws {
        receivedCredentials = credentials
        receivedAuthToken = authToken
        connected = true
    }

    func isConnected(authToken: String) async throws -> Bool {
        if let statusError { throw statusError }
        return connected
    }
    func disconnect(authToken: String) async throws { connected = false }
}

private final class AppSessionStoreSpy: AppSessionStoreProtocol {
    private var session: AppSession?
    private let deleteError: Error?
    private(set) var savedSession: AppSession?
    private(set) var didDelete = false

    init(session: AppSession? = nil, deleteError: Error? = nil) {
        self.session = session
        self.deleteError = deleteError
    }
    func load() throws -> AppSession? { session }
    func save(_ session: AppSession) throws {
        self.session = session
        savedSession = session
    }
    func delete() throws {
        if let deleteError { throw deleteError }
        session = nil
        didDelete = true
    }
}
