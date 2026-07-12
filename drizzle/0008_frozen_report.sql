ALTER TABLE `report_item` DROP COLUMN `audience`;--> statement-breakpoint
ALTER TABLE `report_item` ADD `inclusion_override` text;--> statement-breakpoint
ALTER TABLE `report_item` ADD `overridden_by` text;--> statement-breakpoint
ALTER TABLE `report` ADD `created_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `report_campaign_version_unique` ON `report` (`campaign_id`,`version`);