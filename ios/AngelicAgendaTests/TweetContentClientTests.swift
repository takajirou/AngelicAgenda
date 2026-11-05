import XCTest
@testable import AngelicAgenda

@MainActor
final class TweetContentClientTests: XCTestCase {
    override func tearDown() {
        URLProtocolStub.requestHandler = nil
        super.tearDown()
    }

    func testFetchLatestSendsAuthorizationAndDecodesTweets() async throws {
        let responseBody = """
        [
          {
            "tweetId": "1234567890",
            "text": "先行抽選の受付を開始しました",
            "authorDisplayName": "公式アカウント",
            "authorHandle": "official",
            "profileImageUrl": "https://pbs.twimg.com/profile_images/987654321/icon_normal.jpg",
            "originalUrl": "https://x.com/official/status/1234567890",
            "notificationType": "tweet",
            "sourceTag": "x_web_push",
            "notifiedAt": "2026-11-01T16:00:29Z",
            "receivedAt": "2026-11-01T16:00:30.781Z"
          }
        ]
        """
        URLProtocolStub.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/tweets")
            XCTAssertEqual(request.url?.query, "limit=50")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer session-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")

            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )
            )
            return (response, Data(responseBody.utf8))
        }
        let subject = TweetContentClient(urlSession: makeStubbedSession())

        let tweets = try await subject.fetchLatest(
            baseURL: try XCTUnwrap(URL(string: "https://agenda-api.example.com")),
            authToken: " session-token ",
            limit: 50
        )

        XCTAssertEqual(tweets.count, 1)
        XCTAssertEqual(tweets[0].tweetId, "1234567890")
        XCTAssertEqual(tweets[0].text, "先行抽選の受付を開始しました")
        XCTAssertEqual(tweets[0].authorDisplayName, "公式アカウント")
        XCTAssertEqual(tweets[0].authorHandle, "official")
        XCTAssertEqual(
            tweets[0].profileImageUrl?.absoluteString,
            "https://pbs.twimg.com/profile_images/987654321/icon_normal.jpg"
        )
        XCTAssertEqual(tweets[0].originalUrl.absoluteString, "https://x.com/official/status/1234567890")
        XCTAssertNotNil(tweets[0].notifiedAt)
        XCTAssertEqual(tweets[0].receivedAt.timeIntervalSince1970, 1_793_548_830.781, accuracy: 0.001)
    }

    func testFetchLatestRejectsServerError() async throws {
        URLProtocolStub.requestHandler = { request in
            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 401,
                    httpVersion: nil,
                    headerFields: nil
                )
            )
            return (response, Data())
        }
        let subject = TweetContentClient(urlSession: makeStubbedSession())

        do {
            _ = try await subject.fetchLatest(
                baseURL: try XCTUnwrap(URL(string: "https://agenda-api.example.com")),
                authToken: "session-token",
                limit: 50
            )
            XCTFail("HTTPエラーが返る必要があります")
        } catch {
            XCTAssertEqual(error as? TweetContentClientError, .serverError(statusCode: 401))
        }
    }

    func testFetchLatestRejectsInvalidPayload() async throws {
        URLProtocolStub.requestHandler = { request in
            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: nil
                )
            )
            return (response, Data("{}".utf8))
        }
        let subject = TweetContentClient(urlSession: makeStubbedSession())

        do {
            _ = try await subject.fetchLatest(
                baseURL: try XCTUnwrap(URL(string: "https://agenda-api.example.com")),
                authToken: "session-token",
                limit: 50
            )
            XCTFail("不正なデータを拒否する必要があります")
        } catch {
            XCTAssertEqual(error as? TweetContentClientError, .invalidData)
        }
    }

    private func makeStubbedSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolStub.self]
        return URLSession(configuration: configuration)
    }
}

private final class URLProtocolStub: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let requestHandler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let (response, data) = try requestHandler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
