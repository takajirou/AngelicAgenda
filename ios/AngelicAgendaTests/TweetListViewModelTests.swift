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
        let subject = TweetListViewModel(client: client, setupToken: "setup-token")
        let serverURL = try XCTUnwrap(URL(string: "https://agenda-api.example.com"))

        await subject.load(serverURL: serverURL)

        XCTAssertEqual(subject.tweets, [expectedTweet])
        XCTAssertNil(subject.errorMessage)
        XCTAssertFalse(subject.isLoading)
        XCTAssertEqual(client.receivedBaseURL, serverURL)
        XCTAssertEqual(client.receivedSetupToken, "setup-token")
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
        let subject = TweetListViewModel(client: client, setupToken: "setup-token")
        let serverURL = try XCTUnwrap(URL(string: "https://agenda-api.example.com"))
        await subject.load(serverURL: serverURL)
        client.result = .failure(TweetContentClientError.serverError(statusCode: 503))

        await subject.load(serverURL: serverURL)

        XCTAssertEqual(subject.tweets, [existingTweet])
        XCTAssertEqual(subject.errorMessage, "告知を取得できませんでした（HTTP 503）。")
        XCTAssertFalse(subject.isLoading)
    }

    func testResetClearsTweetsAndError() async throws {
        let client = TweetContentClientSpy(
            result: .failure(TweetContentClientError.serverError(statusCode: 500))
        )
        let subject = TweetListViewModel(client: client, setupToken: "setup-token")
        await subject.load(
            serverURL: try XCTUnwrap(URL(string: "https://agenda-api.example.com"))
        )

        subject.reset()

        XCTAssertTrue(subject.tweets.isEmpty)
        XCTAssertNil(subject.errorMessage)
    }
}

private final class TweetContentClientSpy: TweetContentClientProtocol, @unchecked Sendable {
    var result: Result<[TweetContent], Error>
    private(set) var receivedBaseURL: URL?
    private(set) var receivedSetupToken: String?
    private(set) var receivedLimit: Int?

    init(result: Result<[TweetContent], Error>) {
        self.result = result
    }

    func fetchLatest(
        baseURL: URL,
        setupToken: String,
        limit: Int
    ) async throws -> [TweetContent] {
        receivedBaseURL = baseURL
        receivedSetupToken = setupToken
        receivedLimit = limit
        return try result.get()
    }
}
