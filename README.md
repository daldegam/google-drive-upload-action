# google-drive-upload-action
Github action to upload a file to Google Drive using a service account and output the file ID and URL.

## Usage
#### Simple example:
```
steps:
    - uses: actions/checkout@v4

    - name: Upload a file to Google Drive
      uses: nextDriveIoE/google-drive-upload-action@v2
      with:
        target: <LOCAL_PATH_TO_YOUR_FILE>
        credentials: ${{ secrets.<YOUR_SERVICE_ACCOUNT_CREDENTIALS> }}
        parent_folder_id: <YOUR_DRIVE_FOLDER_ID>
```

### Inputs
#### `target` (Optional):
Local path to the file to upload, can be relative from github runner current directory.

If the `target` is a directory, the action will upload all files in the root of that directory (non-recursive). In this case, the `name` parameter will be ignored, and the original file names will be preserved.

#### `credentials` (Required):
A service account public/private key pair encoded in base64.

[Generate and download your credentials in JSON format](https://cloud.google.com/iam/docs/creating-managing-service-account-keys#creating_service_account_keys)

Run `base64 my_service_account_key.json > encoded.txt` and paste the encoded string into a github secret.

#### `parent_folder_id` (Required):
The id of the drive folder where you want to upload your file. It is the string of characters after the last `/` when browsing to your folder URL. You must share the folder with the service account (using its email address) unless you specify a `owner`.

#### `name` (Optional):
The name of the file to be uploaded. Set to the `target` filename if not specified.
Note: This parameter is ignored when the `target` is a directory.

#### `child_folder` (Optional):
A sub-folder where to upload your file. It will be created if non-existent and must remain unique. Useful to organize your drive like so:

You can specify a path with multiple levels (e.g., "folder1/folder2/folder3") and the action will create the folder structure recursively. Each folder in the path will be created if it doesn't exist.

Example:
```yaml
- name: Upload a file to Google Drive
  uses: nextDriveIoE/google-drive-upload-action@v2
  with:
    target: path/to/your/file.txt
    credentials: ${{ secrets.GOOGLE_DRIVE_CREDENTIALS }}
    parent_folder_id: <YOUR_DRIVE_FOLDER_ID>
    child_folder: "version/1.0.0/debug"  # Will create folders: version → 1.0.0 → debug
```

#### `owner` (Optional):
The email address of a user account that has access to the drive folder and will get the ownership of the file after its creation. To use this feature you must grant your service account a [domain-wide delegation of authority](https://developers.google.com/admin-sdk/directory/v1/guides/delegation) beforehand.

#### `overwrite` (Optional):
Set to `true` to overwrite files if they already exist. Default is `false`.

### Outputs
#### `folder_id`
The ID of the folder the file was uploaded to.

#### `file_id`
The id of the uploaded file. If multiple files are uploaded, this will be the ID of the first file.

#### `file_url`
The URL of the uploaded file. If multiple files are uploaded, this will be the URL of the first file.

#### `uploaded_files`
A JSON string containing information about all uploaded files when the `target` is a directory. Each item contains the file's `id` and `url`. This output is only set when multiple files are uploaded.

### Multiple files upload example
```yaml
- name: Upload multiple files to Google Drive
  uses: nextDriveIoE/google-drive-upload-action@v2
  with:
    target: ./dist  # Directory containing files to be uploaded
    credentials: ${{ secrets.GOOGLE_DRIVE_CREDENTIALS }}
    parent_folder_id: <YOUR_DRIVE_FOLDER_ID>
```
