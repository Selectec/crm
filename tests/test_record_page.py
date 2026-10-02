"""Site-free discovery contracts; actual permissions/manifest proof runs on a test site."""

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import frappe


def load():
	path = Path(__file__).parents[1] / "crm/api/record_page.py"
	spec = importlib.util.spec_from_file_location("record_page_contract", path)
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


def declaration(app, order=100):
	return dict(
		id="summary",
		version=1,
		targets=["Contact", "CRM Organization"],
		renderer="summary",
		js=f"{app}_summary.bundle.js",
		css=[],
		order=order,
		panels=[dict(id="main", label="Summary")],
		default_panel="main",
	)


class TestDiscovery(unittest.TestCase):
	def test_infers_installed_owner_checks_parent_and_orders_multiple_contributors(self):
		api = load()
		record = MagicMock()
		hooks = {"second": [declaration("second")], "first": [declaration("first")]}
		manifest = {
			f"{app}_summary.bundle.js": f"/assets/{app}/dist/js/{app}_summary.ABCD.js" for app in hooks
		}
		with (
			patch.object(frappe, "get_doc", return_value=record),
			patch.object(frappe, "get_installed_apps", return_value=["second", "first"]),
			patch.object(frappe, "get_hooks", side_effect=lambda key, app_name: hooks[app_name]),
			patch.object(api, "get_assets_json", return_value=manifest),
		):
			result = api.get_panels("Contact", "Same Name")
		record.check_permission.assert_called_once_with("read")
		self.assertEqual([c["owner_app"] for c in result["contributions"]], ["first", "second"])
		self.assertEqual(result["contributions"][0]["panels"][0]["name"], "first:summary:main")
		self.assertEqual(
			result["contributions"][0]["js"]["url"], "/assets/first/dist/js/first_summary.ABCD.js"
		)
		self.assertTrue(result["diagnostics"])

	def test_invalid_contributors_are_isolated_and_asset_ownership_fails_closed(self):
		api = load()

		def reject(message, error):
			raise error(message)

		bad_assets = [
			"https://outside.test/x.js",
			"//outside.test/x.js",
			"/assets/other/x.js",
			"/assets/demo/../other/x.js",
			"/assets/demo/%2e%2e/x.js",
			"/assets/demo/%252e%252e/x.js",
			"/assets/demo/x.css",
		]
		for url in bad_assets:
			with (
				self.subTest(url=url),
				patch.object(frappe, "throw", side_effect=reject),
				patch.object(frappe, "get_installed_apps", return_value=["demo"]),
				patch.object(frappe, "get_hooks", return_value=[declaration("demo")]),
				patch.object(api, "get_assets_json", return_value={"demo_summary.bundle.js": url}),
			):
				result = api.collect_panels("Contact")
				self.assertEqual(result["contributions"], [])
				self.assertEqual(len(result["diagnostics"]), 1)
		for malformed in (
			dict(declaration("demo"), version=True),
			dict(declaration("demo"), targets=[{}]),
			dict(declaration("demo"), id="native:Details"),
		):
			with (
				self.subTest(malformed=malformed),
				patch.object(frappe, "throw", side_effect=reject),
				patch.object(frappe, "get_installed_apps", return_value=["demo"]),
				patch.object(frappe, "get_hooks", return_value=[malformed]),
				patch.object(
					api,
					"get_assets_json",
					return_value={"demo_summary.bundle.js": "/assets/demo/dist/js/demo.ABC.js"},
				),
			):
				result = api.collect_panels("Contact")
				self.assertEqual(result["contributions"], [])
				self.assertEqual(len(result["diagnostics"]), 1)

	def test_parent_denial_precedes_discovery_and_no_url_can_be_dispatched(self):
		api = load()
		record = MagicMock()
		record.check_permission.side_effect = frappe.PermissionError
		with (
			patch.object(frappe, "get_doc", return_value=record),
			patch.object(frappe, "get_installed_apps") as installed,
		):
			with self.assertRaises(frappe.PermissionError):
				api.get_panels("Contact", "Same Name")
			installed.assert_not_called()


if __name__ == "__main__":
	unittest.main()
