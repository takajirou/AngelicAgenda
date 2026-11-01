import XCTest
@testable import AngelicAgenda

@MainActor
final class TweetListViewModelTests: XCTestCase {
    func testLoadPublishesFetchedTweets() async throws {
        let expectedTweet = TweetContent(
            tweetId: "123",
            text: "予約受付中です",
            authorDisplayName: "公式",
            authorHandle: "official",
            originalUrl: try XCTUnwrap(URL(string: "https://x.com/official/status/123")),
            notificationType: "tweet",
            sourceTag: "x_web_push",
            notifiedAt: nil,
            receivedAt: Date(timeIntervalSince1970: 1_793_516_430)
        )
        let client = TweetContentClientSpy(result: .success([expectedTweet]))
        let subject = TweetListViewModel(client: client)
        let serverURL = try XCTUnwrap(URL(string: "https://agenda-api.example.com"))

        await subject.load(serverURL: serverURL, authToken: "session-token")

        XCTAssertEqual(subject.tweets, [expectedTweet])
        XCTAssertNil(subject.errorMessage)
        XCTAssertFalse(subject.isLoading)
        XCTAssertEqual(client.receivedBaseURL, serverURL)
        XCTAssertEqual(client.receivedAuthToken, "session-token")
        XCTAssertEqual(client.receivedLimit, 50)
    }

    func testLoadPublishesErrorWithoutDiscardingExistingTweets() async throws {
        let existingTweet = TweetContent(
            tweetId: "123",
            text: "予約受付中です",
            authorDisplayName: "公式",
            authorHandle: nil,
            originalUrl: try XCTUnwrap(URL(string: "https://x.com/official/status/123")),
            notificationType: nil,
            sourceTag: nil,
            notifiedAt: nil,
            receivedAt: Date(timeIntervalSince1970: 1_793_516_430)
        )
        let client = TweetContentClientSpy(result: .success([existingTweet]))
        let subject = TweetListViewModel(client: client)
        let serverURL = try XCTUnwrap(URL(string: "https://agenda-api.example.com"))
        await subject.load(serverURL: serverURL, authToken: "session-token")
        client.result = .failure(TweetContentClientError.serverError(statusCode: 503))

        await subject.load(serverURL: serverURL, authToken: "session-token")

        XCTAssertEqual(subject.tweets, [existingTweet])
        XCTAssertEqual(subject.errorMessage, "告知を取得できませんでした（HTTP 503）。")
        XCTAssertFalse(subject.isLoading)
    }

    func testResetClearsTweetsAndError() async throws {
        let client = TweetContentClientSpy(
            result: .failure(TweetContentClientError.serverError(statusCode: 500))
        )
        let subject = TweetListViewModel(client: client)
        await subject.load(
            serverURL: try XCTUnwrap(URL(string: "https://agenda-api.example.com")),
            authToken: "session-token"
        )

        subject.reset()

        XCTAssertTrue(subject.tweets.isEmpty)
        XCTAssertNil(subject.errorMessage)
    }

    func testUnauthorizedResponseRequiresAuthentication() async throws {
        let client = TweetContentClientSpy(
            result: .failure(TweetContentClientError.serverError(statusCode: 401))
        )
        let subject = TweetListViewModel(client: client)

        await subject.load(
            serverURL: try XCTUnwrap(URL(string: "https://agenda-api.example.com")),
            authToken: "expired-token"
        )

        XCTAssertTrue(subject.requiresAuthentication)
    }
}

private final class TweetContentClientSpy: TweetContentClientProtocol, @unchecked Sendable {
    var result: Result<[TweetContent], Error>
    private(set) var receivedBaseURL: URL?
    private(set) var receivedAuthToken: String?
    private(set) var receivedLimit: Int?

    init(result: Result<[TweetContent], Error>) {
        self.result = result
    }

    func fetchLatest(
        baseURL: URL,
        authToken: String,
        limit: Int
    ) async throws -> [TweetContent] {
        receivedBaseURL = baseURL
        receivedAuthToken = authToken
        receivedLimit = limit
        return try result.get()
    }
}
