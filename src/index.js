/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const actions = require('@actions/core');
const { google } = require('googleapis');

const credentials = actions.getInput('credentials', { required: true });
const parentFolderId = actions.getInput('parent_folder_id', { required: true });
const target = actions.getInput('target', { required: false });
const owner = actions.getInput('owner', { required: false });
const childFolder = actions.getInput('child_folder', { required: false });
const overwrite = actions.getInput('overwrite', { required: false }) === 'true';
let filename = actions.getInput('name', { required: false });

const credentialsJSON = JSON.parse(Buffer.from(credentials, 'base64').toString());
const scopes = ['https://www.googleapis.com/auth/drive.file'];
const auth = new google.auth
    .JWT(credentialsJSON.client_email, null, credentialsJSON.private_key, scopes, owner);
const drive = google.drive({ version: 'v3', auth });

async function getUploadFolderId() {
    if (!childFolder) {
        return parentFolderId;
    }

    // Split the child folder path into segments for recursive creation
    const folderSegments = childFolder.split('/').filter(segment => segment.trim() !== '');
    let currentFolderId = parentFolderId;

    // Process each folder segment in sequence
    for (const folderName of folderSegments) {
        // Check if folder already exists
        const { data: { files } } = await drive.files.list({
            q: `name='${folderName}' and '${currentFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
        });

        if (files.length > 1) {
            throw new Error(`More than one entry match the folder name: ${folderName}`);
        }

        // Use existing folder if found
        if (files.length === 1) {
            actions.info(`Using existing folder ${folderName} with ID ${files[0].id}`);
            currentFolderId = files[0].id;
        } else {
            // Create new folder if none exists
            const folderMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [currentFolderId],
            };

            const { data: { id: newFolderId } } = await drive.files.create({
                resource: folderMetadata,
                fields: 'id',
                supportsAllDrives: true,
            });

            actions.info(`Created new folder ${folderName} with ID ${newFolderId}`);
            currentFolderId = newFolderId;
        }
    }

    return currentFolderId;
}

async function getFileId(targetFilename, folderId) {
    const { data: { files } } = await drive.files.list({
        q: `name='${targetFilename}' and '${folderId}' in parents`,
        fields: 'files(id)',
    });

    if (files.length > 1) {
        throw new Error('More than one entry match the file name');
    }
    if (files.length === 1) {
        return files[0].id;
    }

    return null;
}

async function uploadFile(filePath, uploadFolderId, customFilename = null) {
    const actualFilename = customFilename || path.basename(filePath);

    let fileId = null;
    if (overwrite) {
        fileId = await getFileId(actualFilename, uploadFolderId);
    }

    const fileData = {
        body: fs.createReadStream(filePath),
    };

    let result;

    if (fileId === null) {
        if (overwrite) {
            actions.info(`File ${actualFilename} does not exist yet. Creating it.`);
        } else {
            actions.info(`Creating file ${actualFilename}.`);
        }
        const fileMetadata = {
            name: actualFilename,
            parents: [uploadFolderId],
        };

        result = await drive.files.create({
            resource: fileMetadata,
            media: fileData,
            uploadType: 'multipart',
            fields: 'id',
            supportsAllDrives: true,
        });
    } else {
        actions.info(`File ${actualFilename} already exists. Override it.`);
        result = await drive.files.update({
            fileId,
            media: fileData,
        });
    }

    const uploadedFileId = result.data.id;
    actions.info(`File ID: ${uploadedFileId}`);

    const fileUrl = `https://drive.google.com/file/d/${uploadedFileId}/view`;
    actions.info(`File URL: ${fileUrl}`);

    return {
        id: uploadedFileId,
        url: fileUrl
    };
}

async function main() {
    const uploadFolderId = await getUploadFolderId();
    actions.setOutput('folder_id', uploadFolderId);

    if (!target) {
        actions.info('No target file specified. Skipping upload.');
        return;
    }

    // Check if the target is a directory
    const isDirectory = fs.lstatSync(target).isDirectory();

    if (isDirectory) {
        actions.info(`Target is a directory. Uploading all files in ${target}`);

        // List all files in the directory using fs.readdirSync instead of glob
        let files = [];
        try {
            // Get all entries in the directory
            const entries = fs.readdirSync(target, { withFileTypes: true });

            // Filter to include only files (not directories)
            files = entries
                .filter(entry => entry.isFile())
                .map(entry => path.join(target, entry.name));

            actions.info(`Directory contents (${entries.length} entries):`);
            for (const entry of entries) {
                actions.info(`- ${entry.name} (${entry.isFile() ? 'file' : 'directory'})`);
            }
        } catch (error) {
            actions.warning(`Error reading directory: ${error.message}`);
        }

        if (files.length === 0) {
            actions.info('No files found in the directory. Skipping upload.');
            return;
        }

        actions.info(`Found ${files.length} files to upload.`);

        const uploadResults = [];
        for (const file of files) {
            actions.info(`Uploading ${file}...`);
            const result = await uploadFile(file, uploadFolderId);
            uploadResults.push(result);
        }

        // Set outputs with the IDs and URLs of the first file (for compatibility)
        if (uploadResults.length > 0) {
            actions.setOutput('file_id', uploadResults[0].id);
            actions.setOutput('file_url', uploadResults[0].url);
        }

        // Set additional outputs with all files
        actions.setOutput('uploaded_files', JSON.stringify(uploadResults));
        actions.info(`Uploaded ${uploadResults.length} files successfully.`);
    } else {
        // If it's a single file, maintain the original behavior
        if (!filename) {
            filename = path.basename(target);
        }

        const result = await uploadFile(target, uploadFolderId, filename);

        actions.setOutput('file_id', result.id);
        actions.setOutput('file_url', result.url);
    }
}

main().catch((error) => actions.setFailed(error));
