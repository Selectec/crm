# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from unittest.mock import patch
from uuid import uuid4

import frappe
from frappe.email.doctype.email_account.email_account import EmailAccount

from crm.api.activities import get_activities
from crm.tests import CRMTestCase


class TestActivityCommunicationIdentity(CRMTestCase):
	def test_native_sales_communications_keep_their_record_identity(self):
		original_user = frappe.session.user
		self.addCleanup(frappe.set_user, original_user)
		frappe.set_user("Administrator")
		token = uuid4().hex
		lead = frappe.get_doc(
			{"doctype": "CRM Lead", "first_name": f"Native activity identity Lead {token}"}
		).insert(ignore_permissions=True)
		deal = frappe.get_doc(
			{"doctype": "CRM Deal", "deal_name": f"Native activity identity Deal {token}"}
		).insert(ignore_permissions=True)
		converted = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"deal_name": f"Native converted activity identity {token}",
				"lead": lead.name,
			}
		).insert(ignore_permissions=True)
		communications = {}
		# Native email validation is real, but this provider-free serializer test
		# must never resolve a configured account or initiate delivery. Same body
		# and participants deliberately cannot identify these distinct records.
		with (
			patch.object(EmailAccount, "find_incoming", return_value=None),
			patch.object(EmailAccount, "find_outgoing", return_value=None),
			patch.object(
				frappe, "sendmail", side_effect=AssertionError("Serializer test must not send mail")
			),
		):
			for parent in (lead, deal, converted):
				communication = frappe.get_doc(
					{
						"doctype": "Communication",
						"communication_type": "Communication",
						"communication_medium": "Email",
						"sent_or_received": "Sent",
						"sender": "sender@example.test",
						"recipients": "recipient@example.test",
						"subject": "Native indistinguishable recorded email",
						"content": "<p>Native indistinguishable recorded body</p>",
						"reference_doctype": parent.doctype,
						"reference_name": parent.name,
					}
				)
				communication.flags.skip_add_signature = True
				communication.insert(ignore_permissions=True)
				communication.reload()
				communications[parent.name] = communication
			for parent, expected in (
				(lead, [(communications[lead.name], True)]),
				(deal, [(communications[deal.name], False)]),
				(converted, [(communications[lead.name], True), (communications[converted.name], False)]),
			):
				with self.subTest(doctype=parent.doctype, converted=parent.name == converted.name):
					self.assertTrue(frappe.get_doc(parent.doctype, parent.name).has_permission("read"))
					streams = get_activities(parent.name)
					self.assertEqual(len(streams), 5)
					self.assertTrue(all(isinstance(stream, list) for stream in streams))
					rows = [row for row in streams[0] if row["activity_type"] == "communication"]
					self.assertEqual(len(rows), len(expected))
					self.assertEqual(
						{row.get("name") for row in rows},
						{communication.name for communication, _is_lead in expected},
						"Native timeline records must retain their exact Communication identity",
					)
					for communication, is_lead in expected:
						row = next(row for row in rows if row["name"] == communication.name)
						self.assertEqual(row["is_lead"], is_lead)
						self.assertEqual(row["creation"], communication.creation)
						self.assertEqual(row["data"]["subject"], communication.subject)
						self.assertEqual(row["data"]["content"], communication.content)
						self.assertEqual(row["data"]["sender"], communication.sender)
						self.assertEqual(row["data"]["recipients"], communication.recipients)
						self.assertEqual(row["data"]["attachments"], [])
