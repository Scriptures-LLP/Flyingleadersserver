import { Airport } from "../../models/Airport.js";
import { syncAirportRemove, syncAirportUpsert } from "../../mysql/sync/airportSync.js";
import { makeCrudController } from "./crudFactory.js";

export const airportController = makeCrudController(Airport, "Airport", {
  upsert: syncAirportUpsert,
  remove: syncAirportRemove,
});
