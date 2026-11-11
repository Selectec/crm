# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from unittest.mock import patch
from uuid import uuid4

import frappe

from crm.fcrm.doctype.crm_organization.crm_organization import get_contacts
from crm.tests import CRMTestCase


class TestOrganizationContacts(CRMTestCase):
	def setUp(self):
		self.user = frappe.session.user
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, self.user)
		self.a, self.b = [
			frappe.get_doc(
				{
					"doctype": "CRM Organization",
					"organization_name": "Affiliation test " + uuid4().hex,
				}
			).insert()
			for _ in range(2)
		]

	def contact(self, company="", links=()):
		return frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Affiliation test " + uuid4().hex,
				"company_name": company,
				"links": [{"link_doctype": "CRM Organization", "link_name": name} for name in links],
			}
		).insert()

	def test_direct_links_selected_compatibility_and_read_only(self):
		both = self.contact(self.a.name, [self.a.name, self.b.name])
		primary = self.contact(self.a.name)
		secondary = self.contact("Legacy company text", [self.b.name])
		before = both.reload().as_dict()
		self.assertCountEqual([r.name for r in get_contacts(self.a.name)["data"]], [both.name, primary.name])
		result = get_contacts(self.b.name)
		self.assertEqual(result["total_count"], 2)
		self.assertCountEqual([r.name for r in result["data"]], [both.name, secondary.name])
		self.assertEqual(
			next(r for r in result["data"] if r.name == secondary.name).company_name, "Legacy company text"
		)
		self.assertEqual(both.reload().as_dict(), before)
		both.set("links", [r for r in both.links if r.link_name != self.b.name])
		both.save()
		self.assertEqual([r.name for r in get_contacts(self.b.name)["data"]], [secondary.name])

	def test_duplicate_links_and_stable_pagination(self):
		contacts = [self.contact(self.a.name, [self.a.name, self.b.name]) for _ in range(23)]
		# A historical duplicate can exist without a normal Contact save retaining it.
		duplicate = frappe.get_doc(
			{
				"doctype": "Dynamic Link",
				"parent": contacts[0].name,
				"parenttype": "Contact",
				"parentfield": "links",
				"link_doctype": "CRM Organization",
				"link_name": self.b.name,
			}
		)
		duplicate.db_insert()
		for contact in contacts:
			frappe.db.set_value(
				"Contact", contact.name, "modified", "2026-01-01 12:00:00", update_modified=False
			)
		first, second = get_contacts(self.b.name), get_contacts(self.b.name, 20)
		self.assertEqual(first["total_count"], 23)
		self.assertEqual(second["total_count"], 23)
		self.assertEqual([r.name for r in first["data"] + second["data"]], sorted(c.name for c in contacts))
		self.assertEqual(len(first["data"]), 20)
		self.assertEqual(len(second["data"]), 3)

	def test_parent_and_contact_permissions_and_selected_redaction(self):
		from frappe.permissions import add_user_permission

		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": "affiliation-" + uuid4().hex + "@example.invalid",
				"first_name": "Affiliation test",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert(ignore_permissions=True)
		visible = self.contact(self.a.name, [self.b.name])
		self.contact(self.b.name)
		add_user_permission("Contact", visible.name, user.name, ignore_permissions=True)
		add_user_permission("CRM Organization", self.b.name, user.name, ignore_permissions=True)
		frappe.set_user(user.name)
		result = get_contacts(self.b.name)
		self.assertEqual(result["total_count"], 1)
		self.assertEqual([r.name for r in result["data"]], [visible.name])
		self.assertIsNone(result["data"][0].company_name)
		self.assertIsNone(result["data"][0].company_logo)
		with self.assertRaises(frappe.PermissionError):
			get_contacts(self.a.name)
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			get_contacts(self.b.name)

	def test_page_bounds(self):
		for start, length in [(-1, 20), (0, 0), (0, 101)]:
			with self.assertRaises(frappe.ValidationError):
				get_contacts(self.a.name, start, length)

	def test_hidden_relationship_fields_deny_count_and_rows(self):
		self.contact(self.a.name)
		meta = frappe.get_meta("Contact")
		for fieldname in ("company_name", "links"):
			with patch.object(meta.get_field(fieldname), "permlevel", 1):
				with self.assertRaises(frappe.PermissionError):
					get_contacts(self.a.name)

	def test_masked_relationships_deny_count_and_rows(self):
		if not hasattr(frappe.get_meta("Contact"), "get_masked_fields"):
			self.skipTest("Native masking requires Frappe 16")
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": "affiliation-mask-" + uuid4().hex + "@example.invalid",
				"first_name": "Affiliation mask",
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert(ignore_permissions=True)
		self.contact(self.a.name)
		frappe.set_user(user.name)
		for doctype, parent, fieldname in [
			("Contact", None, "company_name"),
			("Dynamic Link", "Contact", "link_name"),
		]:
			meta = frappe.get_meta(doctype)
			key = f"masked_fields::{doctype}::{parent or ''}::{user.name}"
			frappe.cache.delete_value(key)
			try:
				with patch.object(meta.get_field(fieldname), "mask", 1):
					with self.assertRaises(frappe.PermissionError):
						get_contacts(self.a.name)
			finally:
				frappe.cache.delete_value(key)

	def test_native_permission_query_conditions_apply_to_total_and_rows(self):
		visible = self.contact(self.a.name)
		self.contact(self.a.name)
		hooks = frappe.get_hooks("permission_query_conditions", {})
		with patch.dict(frappe.flags, {"organization_contacts_test_allowed": visible.name}):
			with patch.dict(hooks, {"Contact": ["crm.tests.test_organization_contacts.contact_condition"]}):
				result = get_contacts(self.a.name)
		self.assertEqual(result["total_count"], 1)
		self.assertEqual([row.name for row in result["data"]], [visible.name])

	def test_party_links_are_not_direct_organization_affiliations(self):
		contact = self.contact()
		for doctype in ("Customer", "Supplier"):
			# Predicate proof independent of ERPNext installation or party setup.
			frappe.get_doc(
				{
					"doctype": "Dynamic Link",
					"parenttype": "Contact",
					"parentfield": "links",
					"parent": contact.name,
					"link_doctype": doctype,
					"link_name": self.b.name,
				}
			).db_insert()
		self.assertEqual(get_contacts(self.b.name), {"data": [], "total_count": 0})

	def test_organization_names_are_parameters(self):
		organization = frappe.get_doc(
			{"doctype": "CRM Organization", "organization_name": "Affiliation 'quoted' " + uuid4().hex}
		).insert()
		contact = self.contact(organization.name)
		result = get_contacts(organization.name)
		self.assertEqual(result["total_count"], 1)
		self.assertEqual([row.name for row in result["data"]], [contact.name])


def contact_condition(user=None, doctype=None):
	del user, doctype
	return "`tabContact`.`name` = " + frappe.db.escape(frappe.flags.organization_contacts_test_allowed)
