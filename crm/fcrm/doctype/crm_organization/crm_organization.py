# Copyright (c) 2023, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model import get_permitted_fields
from frappe.model.db_query import DatabaseQuery
from frappe.model.document import Document

from crm.api.exchange_rate import get_exchange_rate


@frappe.whitelist(methods=["GET", "POST"])
def get_contacts(organization: str, start: int = 0, page_length: int = 20):
	"""Read direct affiliations and CRM's legacy selected-company relationship.

	Use an IN subquery rather than a child join: duplicate Links never multiply
	Contacts, and the native Contact permissions govern both rows and total.
	This read does not infer, repair or persist affiliations.
	"""
	frappe.get_doc("CRM Organization", organization).check_permission("read")
	frappe.has_permission("Contact", "read", throw=True)
	if start < 0 or not 1 <= page_length <= 100:
		frappe.throw(frappe._("Invalid contact page"), frappe.ValidationError)
	meta = frappe.get_meta("Contact")
	links_level = meta.get_field("links").permlevel
	# Native masking is available on v16; v15 has no corresponding field API.
	masked_contact = _masked_fields(meta)
	masked_links = _masked_fields(frappe.get_meta("Dynamic Link"), parenttype="Contact")
	if (
		"company_name" not in get_permitted_fields("Contact", permission_type="read")
		or masked_contact.intersection({"company_name", "links"})
		or masked_links.intersection({"link_doctype", "link_name"})
		or (links_level > 0 and links_level not in meta.get_permlevel_access("read"))
		or not {"link_doctype", "link_name"}.issubset(
			get_permitted_fields("Dynamic Link", parenttype="Contact", permission_type="read")
		)
	):
		frappe.throw(frappe._("Insufficient permission for Contact affiliations"), frappe.PermissionError)
	contact = frappe.qb.DocType("Contact")
	link = frappe.qb.DocType("Dynamic Link")
	linked = (
		frappe.qb.from_(link)
		.select(link.parent)
		.where(
			(link.parenttype == "Contact")
			& (link.parentfield == "links")
			& (link.link_doctype == "CRM Organization")
			& (link.link_name == organization)
		)
	)
	predicate = (contact.company_name == organization) | contact.name.isin(linked)
	fields = ["name", "full_name", "image", "email_id", "mobile_no", "company_name", "modified"]
	# Native DatabaseQuery is present in supported Frappe 15 and 16. Only its
	# relationship condition is extended; permissions, field filtering, masking,
	# sorting and limits remain native. No Contact IDs are materialized in Python.
	query, parameters = frappe.qb.from_(contact).select(contact.name).where(predicate).walk()
	affiliations = frappe.db.mogrify(query, parameters)
	rows = _OrganizationContactQuery(affiliations).execute(
		fields=fields,
		order_by="modified desc, name asc",
		limit_page_length=page_length,
		limit_start=start,
	)
	total = (
		_OrganizationContactQuery(affiliations)
		.execute(
			fields=["count(name) as total"],
			order_by="",
			limit_page_length=1,
		)[0]
		.total
	)
	_redact_selected_organizations(rows)
	return {"data": rows, "total_count": total}


def _masked_fields(meta, parenttype=None):
	if not hasattr(meta, "get_masked_fields"):
		return set()
	return {field.fieldname for field in meta.get_masked_fields(parenttype=parenttype)}


class _OrganizationContactQuery(DatabaseQuery):
	"""Local query composition seam; never changes global get_list behaviour."""

	def __init__(self, affiliations):
		super().__init__("Contact")
		self.affiliations = affiliations

	def build_match_conditions(self, as_condition=True):
		native = super().build_match_conditions(as_condition=as_condition)
		if not as_condition:
			return native
		# affiliations contains only server-owned QB SQL, rendered with native
		# parameter escaping. Compose it as a trusted native match condition;
		# Frappe 15 correctly rejects subqueries in client-supplied filters.
		affiliation = f"`tabContact`.`name` in ({self.affiliations})"
		return f"({native}) and ({affiliation})" if native else affiliation


def _redact_selected_organizations(rows):
	"""Company is a Data field: retain legacy text, redact unreadable records."""
	names = {row.get("company_name") for row in rows if row.get("company_name")}
	if not names:
		return
	existing = set(frappe.get_all("CRM Organization", filters={"name": ["in", names]}, pluck="name"))
	readable = {}
	if frappe.has_permission("CRM Organization", "read"):
		readable = {
			row.name: row
			for row in frappe.get_list(
				"CRM Organization",
				filters={"name": ["in", names]},
				fields=["name", "organization_name", "organization_logo"],
				limit_page_length=100,
			)
			if frappe.has_permission("CRM Organization", "read", doc=row.name)
		}
	for row in rows:
		name = row.get("company_name")
		row["company_logo"] = None
		if name in readable:
			row["company_name"] = readable[name].get("organization_name") or name
			row["company_logo"] = readable[name].get("organization_logo")
		elif name in existing:
			row["company_name"] = None


class CRMOrganization(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		address: DF.Link | None
		annual_revenue: DF.Currency
		currency: DF.Link | None
		exchange_rate: DF.Float
		industry: DF.Link | None
		no_of_employees: DF.Literal["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]
		organization_logo: DF.AttachImage | None
		organization_name: DF.Data | None
		territory: DF.Link | None
		website: DF.Data | None
	# end: auto-generated types

	def validate(self):
		self.update_exchange_rate()

	def after_insert(self):
		# Auto-enrich a new Organization from its website (best-effort, background job).
		from crm.domain_enrichment.tasks import auto_enrich_on_create

		auto_enrich_on_create(self)

	def update_exchange_rate(self):
		if self.has_value_changed("currency") or not self.exchange_rate:
			system_currency = frappe.db.get_single_value("FCRM Settings", "currency") or "USD"
			exchange_rate = 1
			if self.currency and self.currency != system_currency:
				exchange_rate = get_exchange_rate(self.currency, system_currency)

			self.db_set("exchange_rate", exchange_rate)

	@staticmethod
	def default_list_data():
		columns = [
			{
				"label": "Organization",
				"type": "Data",
				"key": "organization_name",
				"width": "16rem",
			},
			{
				"label": "Website",
				"type": "Data",
				"key": "website",
				"width": "14rem",
			},
			{
				"label": "Industry",
				"type": "Link",
				"key": "industry",
				"options": "CRM Industry",
				"width": "14rem",
			},
			{
				"label": "Annual Revenue",
				"type": "Currency",
				"key": "annual_revenue",
				"width": "14rem",
			},
			{
				"label": "Last Modified",
				"type": "Datetime",
				"key": "modified",
				"width": "8rem",
			},
		]
		rows = [
			"name",
			"organization_name",
			"organization_logo",
			"website",
			"industry",
			"currency",
			"annual_revenue",
			"modified",
		]
		return {"columns": columns, "rows": rows}
