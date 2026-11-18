import SwiftUI

struct TweetFilterSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = TweetFilterSettingsViewModel()
    let session: AppSession
    let onSaved: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("絞り込みを有効にする", isOn: $viewModel.filteringEnabled)
                } footer: {
                    Text("無効の場合は、受信したすべてのツイートを表示します。")
                }

                Section("表示する告知") {
                    ForEach(TweetFilterCategory.allCases) { category in
                        Toggle(
                            isOn: Binding(
                                get: { viewModel.selectedCategories.contains(category) },
                                set: { viewModel.setSelected(category, selected: $0) }
                            )
                        ) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(category.title)
                                Text(category.explanation)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .disabled(
                            viewModel.selectedCategories.count == 1
                                && viewModel.selectedCategories.contains(category)
                        )
                    }
                }

                Section {
                    Text("ツイート本文の語句から自動判定します。判定できない投稿は、絞り込み有効時には表示されません。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("告知の絞り込み")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        Task {
                            if await viewModel.save(
                                serverURL: AngelicServerConfiguration.baseURL,
                                authToken: session.token
                            ) {
                                onSaved()
                                dismiss()
                            }
                        }
                    }
                    .disabled(!viewModel.canSave)
                }
            }
            .overlay {
                if viewModel.isLoading || viewModel.isSaving {
                    ProgressView()
                }
            }
            .task {
                await viewModel.load(
                    serverURL: AngelicServerConfiguration.baseURL,
                    authToken: session.token
                )
            }
            .alert(
                "設定を更新できませんでした",
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.clearError() } }
                )
            ) {
                Button("閉じる", role: .cancel) { viewModel.clearError() }
            } message: {
                Text(viewModel.errorMessage ?? "時間をおいて、もう一度お試しください。")
            }
        }
    }
}
