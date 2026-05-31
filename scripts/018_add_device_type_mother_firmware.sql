-- 018_add_device_type_mother_firmware.sql
-- Add mother_firmware_folder column to device_types table

ALTER TABLE device_types ADD COLUMN IF NOT EXISTS mother_firmware_folder VARCHAR(128);

-- Update existing device types with their mother firmware folders
UPDATE device_types SET mother_firmware_folder = 'esp32_relay_4ch_hybrid' WHERE code = 'relay_4ch';
UPDATE device_types SET mother_firmware_folder = 'esp32_relay_8ch_hybrid' WHERE code = 'relay_8ch';
UPDATE device_types SET mother_firmware_folder = 'esp32_mother_sensor' WHERE code = 'sensor';
UPDATE device_types SET mother_firmware_folder = 'esp32_relay_4ch_hybrid' WHERE code = 'mixed';