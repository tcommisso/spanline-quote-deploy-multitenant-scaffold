CREATE TEMPORARY TABLE `tmp_blind_fabric_colour_seed` (
  `fabricRangeName` varchar(128) NOT NULL,
  `categoryNumber` varchar(16) NOT NULL,
  `name` varchar(128) NOT NULL,
  `sortOrder` int NOT NULL
);

INSERT INTO `tmp_blind_fabric_colour_seed` (`fabricRangeName`, `categoryNumber`, `name`, `sortOrder`) VALUES
('Skyline 99', '2', 'Ebony 400', 10),
('Skyline 99', '2', 'Gunmetal 401', 20),
('Skyline 99', '2', 'Chestnut 402', 30),
('Skyline 99', '2', 'Storm 403', 40),
('Skyline 99', '2', 'Paperbark 404', 50),
('Skyline 99', '2', 'Desert 406', 60),
('Skyline 99', '2', 'Black Opal 407', 70),
('Skyline 99', '2', 'Shadow 408', 80),
('Skyline 99', '2', 'Colorado 409', 90),
('Skyline 99', '2', 'Basalt® 411', 100),
('Skyline 99', '2', 'Monument® 412', 110),
('Mode 95', '2', 'Surfmist® 502', 10),
('Mode 95', '2', 'Deep Sea 503', 20),
('Mode 95', '2', 'Spice 504', 30),
('Mode 95', '2', 'Silver Sky 505', 40),
('Mode 95', '2', 'Bamboo 507', 50),
('Mode 95', '2', 'Nougat 508', 60),
('Mode 95', '2', 'Flint 509', 70),
('Mode 95', '2', 'Moonlight 510', 80),
('Mode 95', '2', 'Chalk 517', 90),
('Mode 95', '2', 'Greystone 526', 100),
('Mode 95', '2', 'Wheat 529', 110),
('Mode 95', '2', 'Mocha 533', 120),
('Mode 95', '2', 'Windspray ® 538', 130),
('Mode 95', '2', 'Shale Grey® 539', 140),
('Mode 95', '2', 'Woodland Grey® 540', 150),
('Mode 95', '2', 'Basalt® 541', 160),
('Mode 95', '2', 'Monument® 542', 170),
('Mode 95', '2', 'Eclipse 544', 180),
('Mode 95', '2', 'Ash 551', 190),
('Mode 95', '2', 'Blackstone 553', 200),
('Mode 95', '2', 'Alpaca 566', 210),
('Mode 95', '2', 'Forest Green 559', 220),
('Mode 95', '2', 'Platinum 564', 230),
('Mode 95', '2', 'Porcelain 572', 240),
('Mode 95', '2', 'Marzipan 575', 250),
('Mode 95', '2', 'Pale Eucalypt® 580', 260),
('Mode 95', '2', 'Maroon 597', 270),
('Ombra 1% Fabric', '2', 'Surfmist® 702', 10),
('Ombra 1% Fabric', '2', 'Flint 709', 20),
('Ombra 1% Fabric', '2', 'Moonlight 710', 30),
('Ombra 1% Fabric', '2', 'Basalt® 741', 40),
('Ombra 1% Fabric', '2', 'Monument® 742', 50),
('Ombra 1% Fabric', '2', 'Blackstone 753', 60),
('Ombra 1% Fabric', '2', 'Alpaca 766', 70),
('Ombra 1% Fabric', '2', 'Platinum 764', 80),
('Ombra 6% Fabric', '1', 'Surfmist® 502', 10),
('Ombra 6% Fabric', '1', 'Flint 509', 20),
('Ombra 6% Fabric', '1', 'Moonlight 510', 30),
('Ombra 6% Fabric', '1', 'Mocha 533', 40),
('Ombra 6% Fabric', '1', 'Basalt® 541', 50),
('Ombra 6% Fabric', '1', 'Monument® 542', 60),
('Ombra 6% Fabric', '1', 'Blackstone 553', 70),
('Ombra 6% Fabric', '1', 'Platinum 564', 80),
('Ombra 6% Fabric', '1', 'Alpaca 566', 90),
('Clear PVC', '5', '1mm Clear PVC', 10),
('Clear PVC', '5', '1mm Smoke PVC', 20);

INSERT INTO `blind_fabric_colours` (`tenantId`, `fabricRangeId`, `fabricRangeName`, `categoryNumber`, `name`, `hexCode`, `isActive`, `sortOrder`)
SELECT
  `tenants`.`id`,
  `fabric`.`id`,
  `seed`.`fabricRangeName`,
  `seed`.`categoryNumber`,
  `seed`.`name`,
  NULL,
  1,
  `seed`.`sortOrder`
FROM `tenants`
CROSS JOIN `tmp_blind_fabric_colour_seed` AS `seed`
LEFT JOIN `blind_glass_infill` AS `fabric`
  ON `fabric`.`tenantId` = `tenants`.`id`
  AND `fabric`.`categoryNumber` = `seed`.`categoryNumber`
  AND `fabric`.`glassType` = `seed`.`fabricRangeName`
LEFT JOIN `blind_fabric_colours` AS `existing`
  ON `existing`.`tenantId` = `tenants`.`id`
  AND `existing`.`name` = `seed`.`name`
  AND (
    (`fabric`.`id` IS NOT NULL AND `existing`.`fabricRangeId` = `fabric`.`id`)
    OR (
      `fabric`.`id` IS NULL
      AND `existing`.`fabricRangeId` IS NULL
      AND `existing`.`fabricRangeName` = `seed`.`fabricRangeName`
      AND `existing`.`categoryNumber` = `seed`.`categoryNumber`
    )
  )
WHERE `existing`.`id` IS NULL;

DROP TEMPORARY TABLE `tmp_blind_fabric_colour_seed`;
