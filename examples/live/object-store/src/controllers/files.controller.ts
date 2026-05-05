import {inject} from '@loopback/core';
import {del, get, param, post, requestBody} from '@loopback/rest';
import {FileStorageService} from '../services/file-storage.service';

interface PutBody { name: string; content: string; description?: string }

/**
 * Object Store category — natsbyexample.com/examples/os/intro
 *
 * Demonstrates: bucket creation, put/get/delete/list/info, chunked storage.
 */
export class FilesController {
  constructor(@inject('services.FileStorageService') private fs: FileStorageService) {}

  @post('/files')
  async put(@requestBody() body: PutBody): Promise<unknown> {
    const data = new TextEncoder().encode(body.content);
    const info = await this.fs.put(body.name, data, body.description);
    console.log(`[os] PUT files/${body.name} bytes=${data.byteLength}`);
    return {name: info.name, size: info.size, chunks: info.chunks, mtime: info.mtime};
  }

  @get('/files/{name}')
  async get(@param.path.string('name') name: string): Promise<{name: string; content: string} | {found: false}> {
    const data = await this.fs.get(name);
    if (!data) return {found: false};
    const content = new TextDecoder().decode(data);
    console.log(`[os] GET files/${name} bytes=${data.byteLength}`);
    return {name, content};
  }

  @get('/files/{name}/info')
  async info(@param.path.string('name') name: string): Promise<unknown> {
    const info = await this.fs.info(name);
    if (!info) return {found: false};
    return {name: info.name, size: info.size, chunks: info.chunks, mtime: info.mtime, deleted: info.deleted};
  }

  @get('/files')
  async list(): Promise<unknown> {
    const items = await this.fs.list();
    return {count: items.length, items: items.map(i => ({name: i.name, size: i.size, chunks: i.chunks}))};
  }

  @del('/files/{name}')
  async remove(@param.path.string('name') name: string): Promise<{name: string; deleted: true}> {
    await this.fs.delete(name);
    console.log(`[os] DELETE files/${name}`);
    return {name, deleted: true};
  }
}
