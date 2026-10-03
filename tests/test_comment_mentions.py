"""Native mention labels use document metadata; notification transport is external."""

import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import frappe


def load_comment_api():
	path = Path(__file__).parents[1] / "crm/api/comment.py"
	spec = importlib.util.spec_from_file_location("native_comment_mentions", path)
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


class TestNativeMentionTitles(unittest.TestCase):
	def test_native_titles_and_existing_sales_labels_keep_notification_identity_and_content(self):
		api = load_comment_api()
		cases = [
			("Contact", "Native full contact name", {}),
			("CRM Organization", "Native organisation name", {}),
			("CRM Lead", "Native lead name", {"lead_name": "Native lead name"}),
			("CRM Deal", "Native organisation", {"organization": "Native organisation", "lead_name": "Lead fallback"}),
			("CRM Deal", "", {"organization": None, "lead_name": "Lead fallback"}),
		]
		for doctype, title, fields in cases:
			with self.subTest(doctype=doctype, title=title):
				parent = SimpleNamespace(name="Native parent", get_title=lambda: title, get=fields.get, **fields)
				content = '<p>Complete native mention <span data-type="mention" data-id="reader@example.test">Reader</span></p>'
				comment = SimpleNamespace(name="Native remark", owner="author@example.test", reference_doctype=doctype, reference_name=parent.name, content=content)
				with (
					patch.object(frappe, "get_doc", return_value=parent),
					patch.object(frappe, "get_cached_value", return_value="Native author"),
					patch.object(api, "notify_user") as notify,
				):
					api.notify_mentions(comment)
				notify.assert_called_once()
				notification = notify.call_args.args[0]
				self.assertEqual(notification["message"], content)
				self.assertEqual(notification["assigned_to"], "reader@example.test")
				self.assertEqual((notification["reference_doctype"], notification["reference_docname"]), ("Comment", comment.name))
				self.assertEqual((notification["redirect_to_doctype"], notification["redirect_to_docname"]), (doctype, parent.name))
				self.assertIn(title or "Lead fallback", notification["notification_text"])
