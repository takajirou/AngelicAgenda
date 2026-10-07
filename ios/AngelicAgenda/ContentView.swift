import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authentication: AuthenticationViewModel

    var body: some View {
        Group {
            if let connection = authentication.connection {
                authenticatedView(connection: connection)
            } else {
                LoginView()
            }
        }
        .alert(
            "接続できませんでした",
            isPresented: Binding(
                get: { authentication.errorMessage != nil },
                set: { if !$0 { authentication.clearError() } }
            )
        ) {
            Button("閉じる", role: .cancel) {
                authentication.clearError()
            }
        } message: {
            Text(authentication.errorMessage ?? "時間をおいて、もう一度お試しください。")
        }
    }

    private func authenticatedView(connection: AngelicConnection) -> some View {
        NavigationStack {
            ContentUnavailableView(
                "告知はまだありません",
                systemImage: "bell.badge",
                description: Text("受信した告知がここに表示されます")
            )
            .navigationTitle("告知")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Text(connection.serverURL.host() ?? connection.serverURL.absoluteString)
                        Button("この端末の接続情報を削除", role: .destructive) {
                            authentication.signOut()
                        }
                    } label: {
                        Image(systemName: "person.crop.circle")
                            .accessibilityLabel("アカウント")
                    }
                }
            }
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(AuthenticationViewModel.preview(connected: true))
    }
}
