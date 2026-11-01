import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var authentication: AuthenticationViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var isRegistering = false

    var body: some View {
        NavigationStack {
            Form {
                Section("アカウント") {
                    TextField("メールアドレス", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .textContentType(.username)
                    SecureField("パスワード（12文字以上）", text: $password)
                        .textContentType(isRegistering ? .newPassword : .password)
                }

                Section {
                    Toggle("新しいアカウントを作成", isOn: $isRegistering)
                    Button {
                        Task {
                            if isRegistering {
                                await authentication.register(email: email, password: password)
                            } else {
                                await authentication.login(email: email, password: password)
                            }
                        }
                    } label: {
                        HStack {
                            Spacer()
                            if authentication.isWorking { ProgressView() }
                            else { Text(isRegistering ? "登録する" : "ログイン").fontWeight(.semibold) }
                            Spacer()
                        }
                    }
                    .disabled(authentication.isWorking || email.isEmpty || password.isEmpty)
                } footer: {
                    Text("ログイン後、自分のXアカウントを接続します。パスワードはサーバーで一方向ハッシュ化されます。")
                }
            }
            .navigationTitle("AngelicAgenda")
        }
    }
}
