import Combine
import Foundation

@MainActor
final class TweetListViewModel: ObservableObject {
    @Published private(set) var tweets: [TweetContent] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var requiresAuthentication = false

    private let client: TweetContentClientProtocol
    convenience init() {
        self.init(client: TweetContentClient())
    }

    init(client: TweetContentClientProtocol) {
        self.client = client
    }

    func load(serverURL: URL, authToken: String) async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        requiresAuthentication = false
        defer { isLoading = false }

        do {
            tweets = try await client.fetchLatest(
                baseURL: serverURL,
                authToken: authToken,
                limit: 50
            )
        } catch {
            if let clientError = error as? TweetContentClientError,
               case .serverError(let statusCode) = clientError,
               statusCode == 401 {
                requiresAuthentication = true
            }
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
        requiresAuthentication = false
    }
}
