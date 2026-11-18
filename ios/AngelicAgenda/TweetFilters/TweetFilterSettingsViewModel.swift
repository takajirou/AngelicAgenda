import Combine
import Foundation

@MainActor
final class TweetFilterSettingsViewModel: ObservableObject {
    @Published var filteringEnabled = false
    @Published private(set) var selectedCategories = Set<TweetFilterCategory>()
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published private(set) var errorMessage: String?

    private let client: TweetFilterSettingsClientProtocol

    convenience init() {
        self.init(client: TweetFilterSettingsClient())
    }

    init(client: TweetFilterSettingsClientProtocol) {
        self.client = client
    }

    var canSave: Bool {
        !isLoading && !isSaving && !selectedCategories.isEmpty
    }

    func load(serverURL: URL, authToken: String) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let settings = try await client.fetch(baseURL: serverURL, authToken: authToken)
            filteringEnabled = settings.filteringEnabled
            selectedCategories = Set(settings.categories)
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    func setSelected(_ category: TweetFilterCategory, selected: Bool) {
        if selected {
            selectedCategories.insert(category)
        } else if selectedCategories.count > 1 {
            selectedCategories.remove(category)
        }
    }

    func save(serverURL: URL, authToken: String) async -> Bool {
        guard canSave else { return false }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let categories = TweetFilterCategory.allCases.filter(selectedCategories.contains)
        do {
            let saved = try await client.save(
                TweetFilterSettings(
                    filteringEnabled: filteringEnabled,
                    categories: categories
                ),
                baseURL: serverURL,
                authToken: authToken
            )
            filteringEnabled = saved.filteringEnabled
            selectedCategories = Set(saved.categories)
            return true
        } catch {
            errorMessage = Self.message(for: error)
            return false
        }
    }

    func clearError() {
        errorMessage = nil
    }

    private static func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription
            ?? "時間をおいて、もう一度お試しください。"
    }
}
