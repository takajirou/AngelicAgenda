import SwiftUI
import WebKit

struct XWebLoginView: View {
    let onCredentials: (XWebSessionCredentials) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            XLoginWebView(onCredentials: onCredentials)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Xにログイン")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("キャンセル") { dismiss() }
                    }
                }
        }
    }
}

struct XLoginWebView: UIViewRepresentable {
    let onCredentials: (XWebSessionCredentials) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onCredentials: onCredentials)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        context.coordinator.observe(cookieStore: configuration.websiteDataStore.httpCookieStore)
        webView.load(URLRequest(url: URL(string: "https://x.com/i/flow/login")!))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onCredentials = onCredentials
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.stopObserving()
        webView.navigationDelegate = nil
        webView.stopLoading()
    }

    static func clearXWebsiteData() async {
        let dataStore = WKWebsiteDataStore.default()
        let cookieStore = dataStore.httpCookieStore
        let cookies = await allCookies(in: cookieStore)

        for cookie in cookies where isXDomain(cookie.domain) {
            await withCheckedContinuation { continuation in
                cookieStore.delete(cookie) {
                    continuation.resume()
                }
            }
        }

        let dataTypes = WKWebsiteDataStore.allWebsiteDataTypes()
        let records = await withCheckedContinuation { continuation in
            dataStore.fetchDataRecords(ofTypes: dataTypes) { records in
                continuation.resume(returning: records)
            }
        }
        let xRecords = records.filter { record in
            let name = record.displayName.lowercased()
            return name == "x.com" || name.hasSuffix(".x.com")
                || name == "twitter.com" || name.hasSuffix(".twitter.com")
        }
        guard !xRecords.isEmpty else { return }
        await withCheckedContinuation { continuation in
            dataStore.removeData(ofTypes: dataTypes, for: xRecords) {
                continuation.resume()
            }
        }
    }

    private static func allCookies(in store: WKHTTPCookieStore) async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in
            store.getAllCookies { cookies in
                continuation.resume(returning: cookies)
            }
        }
    }

    private static func isXDomain(_ domain: String) -> Bool {
        let normalized = domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        return normalized == "x.com" || normalized.hasSuffix(".x.com")
            || normalized == "twitter.com" || normalized.hasSuffix(".twitter.com")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKHTTPCookieStoreObserver {
        var onCredentials: (XWebSessionCredentials) -> Void

        private weak var cookieStore: WKHTTPCookieStore?
        private var didDeliverCredentials = false

        init(onCredentials: @escaping (XWebSessionCredentials) -> Void) {
            self.onCredentials = onCredentials
        }

        func observe(cookieStore: WKHTTPCookieStore) {
            self.cookieStore = cookieStore
            cookieStore.add(self)
        }

        func stopObserving() {
            cookieStore?.remove(self)
            cookieStore = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            inspectCookies()
        }

        func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
            inspectCookies()
        }

        private func inspectCookies() {
            guard !didDeliverCredentials, let cookieStore else { return }
            cookieStore.getAllCookies { [weak self] cookies in
                guard let self, !self.didDeliverCredentials else { return }
                let xCookies = cookies.filter { XLoginWebView.isXDomain($0.domain) }
                guard
                    let authToken = xCookies.first(where: { $0.name == "auth_token" })?.value,
                    let ct0 = xCookies.first(where: { $0.name == "ct0" })?.value,
                    Self.isValidCookieValue(authToken),
                    Self.isValidCookieValue(ct0)
                else {
                    return
                }

                self.didDeliverCredentials = true
                DispatchQueue.main.async {
                    self.onCredentials(
                        XWebSessionCredentials(authToken: authToken, ct0: ct0)
                    )
                }
            }
        }

        private static func isValidCookieValue(_ value: String) -> Bool {
            (20...4_096).contains(value.count)
                && value.unicodeScalars.allSatisfy { scalar in
                    !CharacterSet.whitespacesAndNewlines.contains(scalar)
                        && !CharacterSet.controlCharacters.contains(scalar)
                }
        }
    }
}
