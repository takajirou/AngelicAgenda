import Combine
import Foundation

@MainActor
final class TweetListViewModel: ObservableObject {
    @Published private(set) var tweets: [TweetContent] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let client: TweetContentClientProtocol
    private let setupToken: String

    convenience init() {
        self.init(
            client: TweetContentClient(),
            setupToken: AngelicServerConfiguration.setupToken
        )
    }

    init(client: TweetContentClientProtocol, setupToken: String) {
        self.client = client
        self.setupToken = setupToken
    }

    func load(serverURL: URL) async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            tweets = try await client.fetchLatest(
                baseURL: serverURL,
                setupToken: setupToken,
                limit: 50
            )
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "時間をおいて、もう一度お試しください。"
        }
    }

    func clearError() {
        errorMessage = nil
    }

    func reset() {
        tweets = []
        errorMessage = nil
    }
}
