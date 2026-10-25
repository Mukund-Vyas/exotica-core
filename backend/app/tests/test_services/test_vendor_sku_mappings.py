import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models.product import SKU
from app.models.vendor import Vendor
from app.schemas.transaction import PurchaseCreate, PurchaseItemCreate
from app.schemas.vendor_sku_mapping import VendorSkuMappingCreate, VendorSkuMappingUpdate
from app.services.inventory import record_purchase
from app.services.vendor_sku_mappings import (
    bulk_import,
    create_mapping,
    delete_mapping,
    list_mappings,
    lookup_by_vendor_code,
    mapped_codes_for,
    update_mapping,
)


async def _sku(db, code):
    sku = SKU(id=str(uuid.uuid4()), code=code, name=f"Name {code}", category="Bras", size_variant="34B")
    db.add(sku)
    await db.flush()
    return sku


async def _vendor(db, owner, name):
    v = Vendor(id=str(uuid.uuid4()), name=name, created_by_id=owner.id)
    db.add(v)
    await db.flush()
    return v


def _payload(vendor, sku, code="VT-100", name=None):
    return VendorSkuMappingCreate(vendor_id=vendor.id, sku_id=sku.id, vendor_sku_code=code, vendor_product_name=name)


@pytest.mark.asyncio
async def test_create_and_lookup_is_case_and_space_insensitive(db_session, owner_user, vendor):
    sku = await _sku(db_session, "BR-1")
    created = await create_mapping(db_session, _payload(vendor, sku, "  VT-100  ", "Vimal Lace"), owner_user)
    assert created.vendor_sku_code == "VT-100" and created.sku_code == "BR-1"
    found = await lookup_by_vendor_code(db_session, vendor.id, "vt-100")
    assert found.sku_id == sku.id


@pytest.mark.asyncio
async def test_same_vendor_code_cannot_map_two_skus(db_session, owner_user, vendor):
    a, b = await _sku(db_session, "A"), await _sku(db_session, "B")
    await create_mapping(db_session, _payload(vendor, a, "VT-1"), owner_user)
    with pytest.raises(ConflictError) as exc:
        await create_mapping(db_session, _payload(vendor, b, "vt-1"), owner_user)
    assert exc.value.code == "duplicate_vendor_sku_code" and "A" in exc.value.detail


@pytest.mark.asyncio
async def test_one_code_per_sku_per_vendor_but_different_vendors_may_share_codes(db_session, owner_user, vendor):
    other = await _vendor(db_session, owner_user, "Other Textiles")
    sku = await _sku(db_session, "A")
    await create_mapping(db_session, _payload(vendor, sku, "X-1"), owner_user)
    with pytest.raises(ConflictError) as exc:
        await create_mapping(db_session, _payload(vendor, sku, "X-2"), owner_user)
    assert exc.value.code == "duplicate_vendor_sku_mapping"
    # another vendor may reuse the very same code for a different/same SKU
    await create_mapping(db_session, _payload(other, sku, "X-1"), owner_user)


@pytest.mark.asyncio
async def test_inactive_vendor_unknown_sku_and_unknown_code(db_session, owner_user, vendor):
    sku = await _sku(db_session, "A")
    with pytest.raises(NotFoundError):
        await create_mapping(db_session, VendorSkuMappingCreate(vendor_id=vendor.id, sku_id=str(uuid.uuid4()), vendor_sku_code="Z"), owner_user)
    with pytest.raises(NotFoundError):
        await lookup_by_vendor_code(db_session, vendor.id, "nope")
    vendor.is_active = False
    await db_session.flush()
    with pytest.raises(AppError) as exc:
        await create_mapping(db_session, _payload(vendor, sku), owner_user)
    assert exc.value.code == "vendor_inactive"


@pytest.mark.asyncio
async def test_update_checks_duplicates_and_delete_removes(db_session, owner_user, vendor):
    a, b = await _sku(db_session, "A"), await _sku(db_session, "B")
    m1 = await create_mapping(db_session, _payload(vendor, a, "V1"), owner_user)
    await create_mapping(db_session, _payload(vendor, b, "V2"), owner_user)
    with pytest.raises(ConflictError):
        await update_mapping(db_session, m1.id, VendorSkuMappingUpdate(vendor_sku_code="v2"))
    same = await update_mapping(db_session, m1.id, VendorSkuMappingUpdate(vendor_sku_code="V1", vendor_product_name="New name"))
    assert same.vendor_product_name == "New name"  # keeping its own code is not a duplicate
    await delete_mapping(db_session, m1.id)
    rows, total = await list_mappings(db_session, vendor.id, None, None, 50, 0)
    assert total == 1 and rows[0].vendor_sku_code == "V2"


@pytest.mark.asyncio
async def test_list_filters_and_search_escape_wildcards(db_session, owner_user, vendor):
    a, b = await _sku(db_session, "A"), await _sku(db_session, "B")
    await create_mapping(db_session, _payload(vendor, a, "VT-50%"), owner_user)
    await create_mapping(db_session, _payload(vendor, b, "VT-500"), owner_user)
    _, by_sku = await list_mappings(db_session, None, a.id, None, 50, 0)
    _, pct = await list_mappings(db_session, None, None, "50%", 50, 0)
    assert by_sku == 1 and pct == 1  # '%' is literal, not "match anything"


@pytest.mark.asyncio
async def test_bulk_import_reports_each_bad_row_and_keeps_good_ones(db_session, owner_user, vendor):
    await _sku(db_session, "BR-1")
    await _sku(db_session, "BR-2")
    rows = [
        {"vendor_sku_code": "V-1", "vendor_product_name": "One", "exotica_sku_code": "br-1"},
        {"vendor_sku_code": "V-1", "exotica_sku_code": "BR-2"},      # duplicate vendor code
        {"vendor_sku_code": "V-3", "exotica_sku_code": "NOPE"},       # unknown SKU
        {"vendor_sku_code": "", "exotica_sku_code": "BR-2"},          # missing field
        {"vendor_sku_code": "V-5", "exotica_sku_code": "BR-2"},
    ]
    result = await bulk_import(db_session, vendor.id, rows, owner_user)
    assert result.created_count == 2 and result.failed_count == 3
    assert [(e.row_number, e.error_code) for e in result.errors] == [
        (2, "duplicate_vendor_sku_code"), (3, "sku_not_found"), (4, "missing_required_field"),
    ]


@pytest.mark.asyncio
async def test_purchase_line_snapshots_vendor_code_and_survives_later_edits(db_session, owner_user, vendor):
    sku = await _sku(db_session, "BR-1")
    mapping = await create_mapping(db_session, _payload(vendor, sku, "VT-100"), owner_user)
    purchase = await record_purchase(
        db_session,
        PurchaseCreate(vendor_id=vendor.id, purchase_date=date.today(), items=[PurchaseItemCreate(sku_id=sku.id, quantity=5, unit_cost=Decimal("100"))]),
        owner_user,
    )
    assert purchase.items[0].vendor_sku_code == "VT-100"
    await update_mapping(db_session, mapping.id, VendorSkuMappingUpdate(vendor_sku_code="VT-200"))
    assert purchase.items[0].vendor_sku_code == "VT-100"  # history unchanged
    other_sku = await _sku(db_session, "BR-2")
    p2 = await record_purchase(
        db_session,
        PurchaseCreate(vendor_id=vendor.id, purchase_date=date.today(), items=[PurchaseItemCreate(sku_id=other_sku.id, quantity=1, unit_cost=Decimal("10"))]),
        owner_user,
    )
    assert p2.items[0].vendor_sku_code is None  # no mapping -> no code


@pytest.mark.asyncio
async def test_mapped_codes_for_is_scoped_to_one_vendor(db_session, owner_user, vendor):
    other = await _vendor(db_session, owner_user, "Other")
    sku = await _sku(db_session, "A")
    await create_mapping(db_session, _payload(vendor, sku, "MINE"), owner_user)
    await create_mapping(db_session, _payload(other, sku, "THEIRS"), owner_user)
    assert (await mapped_codes_for(db_session, vendor.id, [sku.id]))[sku.id].vendor_sku_code == "MINE"
