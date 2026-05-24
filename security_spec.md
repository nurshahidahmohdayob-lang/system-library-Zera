# Security Specification: Zera International Library System

## Data Invariants
1. A **User Profile** cannot be created by the user as an `admin`.
2. A **Book** can only be created/modified by an `admin`.
3. A **Loan** record can only be created/modified by an `admin`.
4. An **Acquisition Request** can be created by any authenticated user but managed by an `admin`.
5. **Inventory Sessions** are strictly for `admin` write access.

## The "Dirty Dozen" Payloads (Denial Tests)

### 1. Identity Spoofing (User Collection)
- **Target**: `users/{userId}`
- **Payload**: `{ "name": "Evil Bob", "role": "admin" }` (User trying to elevate their own role)
- **Expected**: `PERMISSION_DENIED`

### 2. Unauthorized Catalog Entry (Books Collection)
- **Target**: `books/{newId}`
- **Payload**: `{ "title": "Free Books", "author": "Hacker" }` (Non-admin trying to add a book)
- **Expected**: `PERMISSION_DENIED`

### 3. State Shortcutting (Loans Collection)
- **Target**: `loans/{loanId}`
- **Payload**: `{ "status": "returned" }` (Student trying to mark their own book as returned without physical check-in)
- **Expected**: `PERMISSION_DENIED`

### 4. Shadow Update (Acquisitions)
- **Target**: `acquisitions/{reqId}`
- **Payload**: `{ "status": "received", "ghostField": "malicious" }` (Adding unvetted fields)
- **Expected**: `PERMISSION_DENIED`

### 5. ID Poisoning (Any Collection)
- **Target**: `books/LONG_JUNK_STRING_1.5KB...`
- **Expected**: `PERMISSION_DENIED` (via `isValidId` size check)

### 6. PII Leak (User Collection)
- **Target**: `users/{otherUserId}`
- **Operation**: `get`
- **Expected**: `PERMISSION_DENIED` for non-admin, non-owner users.

### 7. Resource Exhaustion (Books Collection)
- **Target**: `books/{id}`
- **Payload**: `{ "summary": "A" * 1000000 }` (Huge string)
- **Expected**: `PERMISSION_DENIED` (via size enforcement)

### 8. Orphaned Relation (Loans Collection)
- **Target**: `loans/{id}`
- **Payload**: `{ "bookId": "NON_EXISTENT_BOOK", "userId": "AUTH_USER" }`
- **Expected**: `PERMISSION_DENIED` (via `exists()` check on bookId)

### 9. Temporal Corruption (Acquisitions)
- **Target**: `acquisitions/{id}`
- **Payload**: `{ "createdAt": "2020-01-01T00:00:00Z" }` (Old timestamp)
- **Expected**: `PERMISSION_DENIED` (Must use `request.time`)

### 10. Blanket Read Bypass (Loans List)
- **Operation**: `list` on `/loans`
- **Query**: `where('userId', '!=', 'auth.uid')`
- **Expected**: `PERMISSION_DENIED` (Rule must enforce `resource.data.userId == request.auth.uid`)

### 11. Self-Assigned Privileges (User Create)
- **Target**: `users/{userId}`
- **Payload**: `{ "role": "student", "isVerified": true }` (Injecting verification flags)
- **Expected**: `PERMISSION_DENIED`

### 12. Immortal Field Mutating (Books)
- **Target**: `books/{id}` (Update)
- **Payload**: `{ "createdAt": "NEW_DATE" }`
- **Expected**: `PERMISSION_DENIED` (createdAt is immutable)

