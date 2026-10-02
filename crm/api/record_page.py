"""Installed-app declarations for the Organisation and Contact record pages."""

import hashlib
import re
from urllib.parse import unquote, urlsplit

import frappe
from frappe.utils import get_assets_json

TARGETS = frozenset({"CRM Organization", "Contact"})
IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]*$")


def invalid(message):
	frappe.throw(f"Invalid record-page panel: {message}", frappe.ValidationError)


def identifier(value):
	if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
		invalid("identifiers must be plain names")
	return value


def asset(owner, logical, kind, manifest):
	if (
		not isinstance(logical, str)
		or not logical.startswith(owner + "_")
		or not logical.endswith(f".bundle.{kind}")
	):
		invalid(f"{owner} must declare an app-prefixed {kind} bundle")
	url = manifest.get(logical)
	if not isinstance(url, str):
		invalid(f"missing asset manifest entry for {logical}")
	parsed = urlsplit(url)
	decoded = unquote(url)
	if (
		parsed.scheme
		or parsed.netloc
		or parsed.query
		or parsed.fragment
		or "%" in decoded
		or "\\" in decoded
		or not decoded.startswith(f"/assets/{owner}/")
		or any(part in {".", ".."} for part in decoded.split("/"))
		or not decoded.endswith("." + kind)
	):
		invalid(f"asset {logical} must resolve inside its owning app")
	return {"url": url, "revision": hashlib.sha256(url.encode()).hexdigest()}


def collect_panels(doctype):
	manifest = get_assets_json()
	contributions = []
	diagnostics = []
	seen = set()
	for owner in frappe.get_installed_apps():
		identifier(owner)
		declarations = frappe.get_hooks("crm_record_page_panels", app_name=owner) or []
		for declaration in declarations:
			try:
				if (
					not isinstance(declaration, dict)
					or type(declaration.get("version")) is not int
					or declaration.get("version") != 1
				):
					invalid("unsupported descriptor version")
				local_id = identifier(declaration.get("id"))
				renderer = identifier(declaration.get("renderer"))
				targets = declaration.get("targets")
				if (
					not isinstance(targets, list)
					or not targets
					or any(not isinstance(target, str) or target not in TARGETS for target in targets)
				):
					invalid("unsupported targets")
				key = f"{owner}:{local_id}"
				if key in seen:
					contributions = [item for item in contributions if item["key"] != key]
					invalid(f"duplicate contribution {key}")
				seen.add(key)
				if doctype not in targets:
					continue
				order = declaration.get("order", 100)
				if type(order) is not int:
					invalid("order must be an integer")
				panels = declaration.get("panels")
				if not isinstance(panels, list) or not panels:
					invalid("at least one panel is required")
				resolved = []
				ids = set()
				for panel in panels:
					if not isinstance(panel, dict):
						invalid("panel must be an object")
					panel_id = identifier(panel.get("id"))
					if panel_id in ids:
						invalid("duplicate local panel")
					ids.add(panel_id)
					label = panel.get("label")
					icon = panel.get("icon")
					if (
						not isinstance(label, str)
						or not label
						or (
							icon is not None
							and (not isinstance(icon, str) or not re.fullmatch(r"lucide-[a-z0-9-]+", icon))
						)
					):
						invalid("invalid panel label/icon")
					resolved.append(
						{"id": panel_id, "name": f"{key}:{panel_id}", "label": label, "icon": icon}
					)
				default = declaration.get("default_panel")
				if default is not None and (not isinstance(default, str) or default not in ids):
					invalid("default panel must belong to the contribution")
				css = declaration.get("css", [])
				if not isinstance(css, list):
					invalid("css must be a list")
				contributions.append(
					{
						"id": local_id,
						"key": key,
						"owner_app": owner,
						"renderer": renderer,
						"version": 1,
						"order": order,
						"panels": resolved,
						"default_panel": default,
						"js": asset(owner, declaration.get("js"), "js", manifest),
						"css": [asset(owner, path, "css", manifest) for path in css],
					}
				)
			except frappe.ValidationError as error:
				diagnostics.append({"owner_app": owner, "message": str(error)})
	contributions.sort(key=lambda item: (item["order"], item["owner_app"], item["id"]))
	defaults = [item for item in contributions if item["default_panel"]]
	if len(defaults) > 1:
		diagnostics.append(
			{"message": "Multiple default panels requested; the first ordered contribution wins"}
		)
	return {"contributions": contributions, "diagnostics": diagnostics}


@frappe.whitelist(methods=["GET", "POST"])
def get_panels(doctype: str, name: str) -> dict:
	if not isinstance(doctype, str) or doctype not in TARGETS or not isinstance(name, str) or not name:
		invalid("a supported typed record is required")
	frappe.get_doc(doctype, name).check_permission("read")
	return {"context": {"doctype": doctype, "name": name}, **collect_panels(doctype)}
