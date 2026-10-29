import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var authentication: AuthenticationViewModel

    @State private var settings: AngelicServerSettings?
    @State private var isShowingXLogin = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("接続先", value: "agenda-api.takajirou.app")
                } header: {
                    Text("外部サーバー")
                } footer: {
                    Text("接続先とセットアップトークンはBuild Settingsで設定されています。")
                }

                Section {
                    Button {
                        startLogin()
                    } label: {
                        HStack {
                            Spacer()
                            if authentication.isConnecting {
                                ProgressView()
                            } else {
                                Text("Xにログインして接続")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(authentication.isConnecting)
                } footer: {
                    Text("XのWeb画面でログイン後、必要なCookieだけをHTTPSで外部サーバーへ転送します。Cookieの値は画面表示・ログ出力・端末保存を行いません。")
                }

                Section("利用上の注意") {
                    Text("この接続方法はXの非公開Web仕様に依存し、予告なく動かなくなる可能性があります。個人検証用として使用してください。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("AngelicAgenda")
        }
        .fullScreenCover(isPresented: $isShowingXLogin) {
            XWebLoginView { credentials in
                isShowingXLogin = false
                guard let settings else { return }
                Task {
                    if await authentication.connect(credentials: credentials, settings: settings) {
                        await XLoginWebView.clearXWebsiteData()
                        self.settings = nil
                    }
                }
            }
        }
    }

    private func startLogin() {
        do {
            settings = try authentication.validateSettings(
                setupToken: AngelicServerConfiguration.setupToken
            )
            authentication.clearError()
            isShowingXLogin = true
        } catch {
            authentication.setError(error)
        }
    }
}

struct LoginView_Previews: PreviewProvider {
    static var previews: some View {
        LoginView()
            .environmentObject(AuthenticationViewModel.preview(connected: false))
    }
}
