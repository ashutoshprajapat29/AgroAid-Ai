# Security Specification for FarmGuide AI

## Data Invariants
1. A listing must have a valid farmerId that matches the creator's UID.
2. Users can only modify their own profiles and listings.
3. Advice history is private to the user who requested it.
4. Marketplace listings are readable by everyone.

## The Dirty Dozen (Attacks)
1. **Identity Spoofing**: Attempt to create a listing on behalf of another farmer.
2. **Role Escalation**: Attempt to change own role to 'admin' (even if not explicitly implemented, protecting the field).
3. **Ghost Fields**: Adding `isVerified: true` to a listing.
4. **Data Injection**: Injecting a 2MB string into crop advice query.
5. **Orphaned Listing**: Creating a listing with a non-existent farmer document.
6. **Price Tampering**: Updating a listing price by a consumer.
7. **advice Scraping**: Attempting to list all advice documents without a filter.
8. **ID Poisoning**: Using a 500-character string as a document ID.
9. **Timestamp Spoofing**: Setting `createdAt` to a future date in the past.
10. **Private Profile Read**: Attempting to read another user's email/farmDetails.
11. **Listing Overwrite**: Farmer A trying to update Farmer B's listing.
12. **Malicious Role Update**: Changing a listing's category to a 1MB string.
