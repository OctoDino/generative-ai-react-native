/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { RequestOptions } from "../../types";
import { FilesRequestUrl, getHeaders, makeFilesRequest } from "./request";
import {
  FileMetadata,
  FileMetadataResponse,
  ListFilesResponse,
  ListParams,
  UploadFileResponse,
} from "./types";
import { FilesTask } from "./constants";
import {
  GoogleGenerativeAIError,
  GoogleGenerativeAIRequestInputError,
} from "../errors";

// Internal type, metadata sent in the upload
export interface UploadMetadata {
  name?: string;
  ["display_name"]?: string;
}

/**
 * Class for managing GoogleAI file uploads.
 * @public
 */
export class GoogleAIFileManager {
  constructor(
    public apiKey: string,
    private _requestOptions?: RequestOptions,
  ) {}

  /**
     * Upload a file to GoogleAI
     * @param {string} fileUri - The URI of the file to upload
     * @param {object} fileMetadata - Metadata for the file being uploaded
     * @param {string} fileMetadata.displayName - The name of the file being uploaded
     * @param {string} fileMetadata.mimeType - The MIME type of the file being uploaded
     * @returns {Promise<object>} - A promise that resolves to the response from the server
     */
    async uploadFile(fileUri, fileMetadata) {
        // Create a new FormData object and append the file to it
        let file = new FormData();
        file.append('video', {
            uri: fileUri,
            name: fileMetadata.displayName,
            filename: fileMetadata.displayName,
            type: fileMetadata.mimeType
        });
        file.append('Content-Type', 'image/png');

        // Create a new FilesRequestUrl object and get the headers for the upload
        const url = new FilesRequestUrl(FilesTask.UPLOAD, this.apiKey, this._requestOptions);
        const uploadHeaders = getHeaders(url);

        // Generate a boundary for the multipart form data and set the appropriate headers
        const boundary = generateBoundary();
        uploadHeaders.append("X-Goog-Upload-Protocol", "multipart");
        uploadHeaders.append("Content-Type", `multipart/related; boundary=${boundary}`);

        // Create the metadata string for the upload and format it into a multipart message
        const uploadMetadata = getUploadMetadata(fileMetadata);
        const metadataString = JSON.stringify({ file: uploadMetadata });
        const preBlobPart = "--" +
            boundary +
            "\r\n" +
            "Content-Type: application/json; charset=utf-8\r\n\r\n" +
            metadataString +
            "\r\n--" +
            boundary +
            "\r\n" +
            "Content-Type: " +
            fileMetadata.mimeType +
            "\r\n\r\n";
        const postBlobPart = "\r\n--" + boundary + "--";

        // Create a new Blob object from the multipart message and the file
        const blob = new Blob([preBlobPart, file, postBlobPart]);

        // Make the request to upload the file and return the response
        const response = await makeFilesRequest(url, uploadHeaders, blob);
        return response.json();
    }

  /**
   * List all uploaded files
   */
  async listFiles(listParams?: ListParams): Promise<ListFilesResponse> {
    const url = new FilesRequestUrl(
      FilesTask.LIST,
      this.apiKey,
      this._requestOptions,
    );
    if (listParams?.pageSize) {
      url.appendParam("pageSize", listParams.pageSize.toString());
    }
    if (listParams?.pageToken) {
      url.appendParam("pageToken", listParams.pageToken);
    }
    const uploadHeaders = getHeaders(url);
    const response = await makeFilesRequest(url, uploadHeaders);
    return response.json();
  }

  /**
   * Get metadata for file with given ID
   */
  async getFile(fileId: string): Promise<FileMetadataResponse> {
    const url = new FilesRequestUrl(
      FilesTask.GET,
      this.apiKey,
      this._requestOptions,
    );
    url.appendPath(parseFileId(fileId));
    const uploadHeaders = getHeaders(url);
    const response = await makeFilesRequest(url, uploadHeaders);
    return response.json();
  }

  /**
   * Delete file with given ID
   */
  async deleteFile(fileId: string): Promise<void> {
    const url = new FilesRequestUrl(
      FilesTask.DELETE,
      this.apiKey,
      this._requestOptions,
    );
    url.appendPath(parseFileId(fileId));
    const uploadHeaders = getHeaders(url);
    await makeFilesRequest(url, uploadHeaders);
  }
}

/**
 * If fileId is prepended with "files/", remove prefix
 */
function parseFileId(fileId: string): string {
  if (fileId.startsWith("files/")) {
    return fileId.split("files/")[1];
  }
  if (!fileId) {
    throw new GoogleGenerativeAIError(
      `Invalid fileId ${fileId}. ` +
        `Must be in the format "files/filename" or "filename"`,
    );
  }

  return fileId;
}

function generateBoundary(): string {
  let str = "";
  for (let i = 0; i < 2; i++) {
    str = str + Math.random().toString().slice(2);
  }
  return str;
}

export function getUploadMetadata(inputMetadata: FileMetadata): FileMetadata {
  if (!inputMetadata.mimeType) {
    throw new GoogleGenerativeAIRequestInputError("Must provide a mimeType.");
  }
  const uploadMetadata: FileMetadata = {
    mimeType: inputMetadata.mimeType,
    displayName: inputMetadata.displayName,
  };

  if (inputMetadata.name) {
    uploadMetadata.name = inputMetadata.name.includes("/")
      ? inputMetadata.name
      : `files/${inputMetadata.name}`;
  }
  return uploadMetadata;
}
