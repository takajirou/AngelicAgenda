import Foundation
import Security

protocol AppSessionStoreProtocol: AnyObject {
    func load() throws -> AppSession?
    func save(_ session: AppSession) throws
    func delete() throws
}

final class KeychainAppSessionStore: AppSessionStoreProtocol {
    private let service = "com.soujiroupersonalteam.AngelicAgenda.app-session"
    private let account = "current-user"

    func load() throws -> AppSession? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let session = try? JSONDecoder().decode(AppSession.self, from: data) else {
            throw AuthenticationError.sessionReadFailed
        }
        return session
    }

    func save(_ session: AppSession) throws {
        guard let data = try? JSONEncoder().encode(session) else {
            throw AuthenticationError.sessionSaveFailed
        }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let update = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if update == errSecSuccess { return }
        guard update == errSecItemNotFound else { throw AuthenticationError.sessionSaveFailed }
        var insert = baseQuery
        attributes.forEach { insert[$0.key] = $0.value }
        guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else {
            throw AuthenticationError.sessionSaveFailed
        }
    }

    func delete() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AuthenticationError.sessionDeleteFailed
        }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}
