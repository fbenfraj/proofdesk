ALTER TABLE `creator` ADD `handle` text;--> statement-breakpoint
ALTER TABLE `deliverable` ADD `platform_url` text;--> statement-breakpoint
ALTER TABLE `match_suggestion` ADD `rule` text DEFAULT '' NOT NULL;