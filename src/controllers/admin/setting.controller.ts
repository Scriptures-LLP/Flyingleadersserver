import type { Request, Response } from "express";

import { Setting } from "../../models/Setting.js";
import { syncSettingUpsert } from "../../mysql/sync/settingSync.js";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const settingController = {
  get: asyncHandler(async (req: Request, res: Response) => {
    const setting = await Setting.findOne({ key: req.params.key });
    res.json({ item: { key: req.params.key, value: setting?.value ?? "" } });
  }),

  set: asyncHandler(async (req: Request, res: Response) => {
    const { value } = req.body as { value: string };
    const setting = await Setting.findOneAndUpdate(
      { key: req.params.key },
      { key: req.params.key, value },
      { upsert: true, new: true },
    );

    if (env.MYSQL_SYNC_ENABLED) {
      await syncSettingUpsert({ key: setting.key, value: setting.value })
        .then(() => Setting.updateOne({ _id: setting._id }, { "mysqlSync.status": "synced" }))
        .catch((err) => console.error("[mysql-sync] failed to sync setting:", err));
    }

    res.json({ item: { key: setting.key, value: setting.value } });
  }),
};
