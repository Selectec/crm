# Native Organization Contacts

The desktop `Organization.vue` and phone `MobileOrganization.vue` use the same
`useOrganizationContacts` reader and native `ContactsListView` navigation.
`crm.fcrm.doctype.crm_organization.crm_organization.get_contacts` accepts an exact
`organization`, zero-based `start`, and `page_length` from 1 to 100 (default20).
It returns `{data, total_count}`. Results sort by modified descending, then name
ascending; pagination is stable for an unchanged dataset.

Membership is `Contact.company_name == organization` OR a direct native Contact
`links` row whose `link_doctype` is `CRM Organization` and whose `link_name`
is the requested record. Both `parenttype=Contact` and `parentfield=links` are
required. An IN subquery gives one result per Contact before pagination. Customer,
Supplier and other indirect relationships are outside this generic contract.
Reads never infer or save memberships and do not reinterpret `is_primary_contact`.

The parent Organization requires native read access. Native Contact read roles,
user/owner/share restrictions, permission-query conditions, field filtering and
masking govern the rows and count. Hidden relationship fields deny this endpoint
instead of permitting count-based inference. Selected-company labels/logos come
only from readable Organization records; ordinary legacy company text remains
text. The viewed Organization's logo is never substituted for a secondary
Contact's selected company.

The endpoint-local `_OrganizationContactQuery` composes its query-builder-generated,
native-escaped affiliation predicate with native `DatabaseQuery.build_match_conditions`.
This trusted match seam retains Frappe15 and16's native list handling; client
filters are never interpreted as SQL and global `get_list` remains unchanged.
Recheck this seam, permission/filter/masking semantics and both page consumers on
upgrades. Frappe16 is the executed Wyatt baseline; source compatibility review
alone does not establish an executed Frappe15 test pass.

The native Add Contact action retains its existing selected-company assignment
semantics. This change introduces no add-secondary or membership-editing action.
It does not alter Contact creation, Lead/Deal pages, other list endpoints or the
relationship contribution host.

Verification belongs to `crm.tests.test_organization_contacts`, the shared reader's
unit tests, the native relationship-page mounting suite and actual desktop/phone
CRM journeys. Remove this carried change when a compatible official CRM release
provides equivalent direct-affiliation rows, permission-safe totals, pagination
and selected-company redaction on both pages, and those regressions pass after
migrating the consumers.
