import { TourAirportPrice } from "../../models/TourAirportPrice.js";
import { syncTourAirportPriceRemove, syncTourAirportPriceUpsert } from "../../mysql/sync/tourAirportPriceSync.js";
import { makeCrudController } from "./crudFactory.js";

export const tourAirportPriceController = makeCrudController(TourAirportPrice, "Tour airport price", {
  upsert: syncTourAirportPriceUpsert,
  remove: syncTourAirportPriceRemove,
});
