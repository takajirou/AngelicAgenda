import XCTest
@testable import AngelicAgenda

@MainActor
final class TweetFilterSettingsViewModelTests: XCTestCase {
    func testLoadPublishesSavedSettings() async {
        let client = TweetFilterSettingsClientSpy(
            fetchResult: .success(
                TweetFilterSettings(
                    filteringEnabled: true,
                    categories: [.goods]
                )
            )
        )
        let subject = TweetFilterSettingsViewModel(client: client)

        await subject.load(
            serverURL: URL(string: "https://example.com")!,
            authToken: "token"
        )

        XCTAssertTrue(subject.filteringEnabled)
        XCTAssertEqual(subject.selectedCategories, [.goods])
        XCTAssertNil(subject.errorMessage)
    }

    func testCannotDeselectTheLastCategory() async {
        let client = TweetFilterSettingsClientSpy(
            fetchResult: .success(
                TweetFilterSettings(
                    filteringEnabled: true,
                    categories: [.liveTicket]
                )
            )
        )
        let subject = TweetFilterSettingsViewModel(client: client)
        await subject.load(
            serverURL: URL(string: "https://example.com")!,
            authToken: "token"
        )

        subject.setSelected(.liveTicket, selected: false)

        XCTAssertEqual(subject.selectedCategories, [.liveTicket])
    }

    func testSaveSendsSelectedCategories() async {
        let client = TweetFilterSettingsClientSpy(
            fetchResult: .success(
                TweetFilterSettings(
                    filteringEnabled: false,
                    categories: TweetFilterCategory.allCases
                )
            )
        )
        let subject = TweetFilterSettingsViewModel(client: client)
        await subject.load(
            serverURL: URL(string: "https://example.com")!,
            authToken: "token"
        )
        subject.filteringEnabled = true
        subject.setSelected(.liveTicket, selected: false)

        let saved = await subject.save(
            serverURL: URL(string: "https://example.com")!,
            authToken: "token"
        )

        XCTAssertTrue(saved)
        XCTAssertEqual(
            client.savedSettings,
            TweetFilterSettings(filteringEnabled: true, categories: [.goods])
        )
    }
}

private final class TweetFilterSettingsClientSpy: TweetFilterSettingsClientProtocol, @unchecked Sendable {
    var fetchResult: Result<TweetFilterSettings, Error>
    var savedSettings: TweetFilterSettings?

    init(fetchResult: Result<TweetFilterSettings, Error>) {
        self.fetchResult = fetchResult
    }

    func fetch(baseURL: URL, authToken: String) async throws -> TweetFilterSettings {
        try fetchResult.get()
    }

    func save(
        _ settings: TweetFilterSettings,
        baseURL: URL,
        authToken: String
    ) async throws -> TweetFilterSettings {
        savedSettings = settings
        return settings
    }
}
