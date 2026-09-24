import { TourAirportPrice } from "../../models/TourAirportPrice.js";
import { syncTourAirportPriceRemove, syncTourAirportPriceUpsert } from "../../mysql/sync/tourAirportPriceSync.js";
import { makeCrudController } from "./crudFactory.js";

// The admin form (a generic CRUD grid) can only bind flat checkbox fields, not
// a nested object — this flattens appliesTo for it on the way out, the mirror
// of validators/entities.validators.ts#reshapeAppliesTo on the way in. Rows
// saved before categories existed have none, and applied to everyone.
function serializeForAdmin(doc: InstanceType<typeof TourAirportPrice>) {
  const obj = doc.toObject();
  return {
    ...obj,
    appliesToAdult: obj.appliesTo?.adult ?? true,
    appliesToChild: obj.appliesTo?.child ?? true,
    appliesToInfant: obj.appliesTo?.infant ?? true,
  };
}

export const tourAirportPriceController = makeCrudController(
  TourAirportPrice,
  "Tour airport price",
  { upsert: syncTourAirportPriceUpsert, remove: syncTourAirportPriceRemove },
  serializeForAdmin,
);
