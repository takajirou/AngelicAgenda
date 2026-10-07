import XCTest
@testable import AngelicAgenda

@MainActor
final class AuthenticationViewModelTests: XCTestCase {
    func testConnectProvisionsServerAndStoresOnlyConnection() async throws {
        let client = ProvisioningClientSpy()
        let store = ConnectionStoreSpy()
        let subject = AuthenticationViewModel(client: client, connectionStore: store)
        let settings = try subject.validateSettings(
            baseURLText: "https://agenda.example.com",
            setupToken: String(repeating: "s", count: 64)
        )
        let credentials = XWebSessionCredentials(
            authToken: String(repeating: "a", count: 32),
            ct0: String(repeating: "b", count: 32)
        )

        let succeeded = await subject.connect(credentials: credentials, settings: settings)

        XCTAssertTrue(succeeded)
        XCTAssertEqual(client.receivedCredentials, credentials)
        XCTAssertEqual(client.receivedSettings, settings)
        XCTAssertEqual(store.savedConnection?.serverURL, settings.baseURL)
        XCTAssertEqual(subject.connection, store.savedConnection)
        XCTAssertNil(subject.errorMessage)
        XCTAssertFalse(subject.isConnecting)
    }

    func testValidateSettingsRejectsPlainHTTPBeforeProvisioning() {
        let subject = AuthenticationViewModel(
            client: ProvisioningClientSpy(),
            connectionStore: ConnectionStoreSpy()
        )

        XCTAssertThrowsError(
            try subject.validateSettings(
                baseURLText: "http://agenda.example.com",
                setupToken: String(repeating: "s", count: 64)
            )
        ) { error in
            XCTAssertEqual(error as? AuthenticationError, .insecureServerURL)
        }
    }

    func testProvisioningFailureDoesNotStoreConnection() async throws {
        let client = ProvisioningClientSpy(
            error: AuthenticationError.serverError(statusCode: 401, message: "認証に失敗しました")
        )
        let store = ConnectionStoreSpy()
        let subject = AuthenticationViewModel(client: client, connectionStore: store)
        let settings = try subject.validateSettings(
            baseURLText: "https://agenda.example.com",
            setupToken: String(repeating: "w", count: 64)
        )

        let succeeded = await subject.connect(
            credentials: XWebSessionCredentials(
                authToken: String(repeating: "a", count: 32),
                ct0: String(repeating: "b", count: 32)
            ),
            settings: settings
        )

        XCTAssertFalse(succeeded)
        XCTAssertNil(store.savedConnection)
        XCTAssertNil(subject.connection)
        XCTAssertEqual(subject.errorMessage, "認証に失敗しました")
    }

    func testSignOutDeletesConnection() {
        let existing = AngelicConnection(
            serverURL: URL(string: "https://agenda.example.com")!,
            connectedAt: Date()
        )
        let store = ConnectionStoreSpy(connection: existing)
        let subject = AuthenticationViewModel(
            client: ProvisioningClientSpy(),
            connectionStore: store
        )

        subject.signOut()

        XCTAssertNil(subject.connection)
        XCTAssertTrue(store.didDelete)
    }
}

private final class ProvisioningClientSpy: XSessionProvisioningClientProtocol, @unchecked Sendable {
    private let error: Error?
    private(set) var receivedCredentials: XWebSessionCredentials?
    private(set) var receivedSettings: AngelicServerSettings?

    init(error: Error? = nil) {
        self.error = error
    }

    func provision(
        credentials: XWebSessionCredentials,
        settings: AngelicServerSettings
    ) async throws {
        receivedCredentials = credentials
        receivedSettings = settings
        if let error { throw error }
    }
}

private final class ConnectionStoreSpy: AngelicConnectionStoreProtocol {
    private var connection: AngelicConnection?
    private(set) var savedConnection: AngelicConnection?
    private(set) var didDelete = false

    init(connection: AngelicConnection? = nil) {
        self.connection = connection
    }

    func load() throws -> AngelicConnection? { connection }

    func save(_ connection: AngelicConnection) throws {
        self.connection = connection
        savedConnection = connection
    }

    func delete() throws {
        connection = nil
        didDelete = true
    }
}
