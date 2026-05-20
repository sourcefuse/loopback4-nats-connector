import {inject} from '@loopback/core';
import {post, requestBody} from '@loopback/rest';
import {
  NatsConnectorComponentBindings as N,
  NatsPublisher,
  subscribe,
} from 'loopback-nats-connector';

interface Task {
  taskId: string;
  type: string;
  payload?: unknown;
}

/**
 * Queue Groups + Concurrent Message Processing + Iterating Multiple Subscriptions
 *  - natsbyexample.com/examples/messaging/concurrent
 *  - natsbyexample.com/examples/messaging/iterating-multiple-subscriptions
 */
export class QueueConcurrentController {
  private processed = 0;
  constructor(@inject(N.PUBLISHER) private pub: NatsPublisher) {}

  // Queue group — load balanced across instances in 'workers' group
  @subscribe('tasks.work', {queue: 'workers'})
  async processTask(task: Task): Promise<void> {
    this.processed++;
    console.log(
      `[queue] #${this.processed} tasks.work [queue=workers] taskId=${task.taskId} type=${task.type}`,
    );
    await new Promise(r => setTimeout(r, 30));
  }

  // Broadcast — all instances receive
  @subscribe('tasks.notify')
  async onNotify(task: Task): Promise<void> {
    console.log(
      `[broadcast] tasks.notify taskId=${task.taskId} type=${task.type}`,
    );
  }

  // Multiple disjoint subscriptions in same controller
  @subscribe('audit.login')
  async onLogin(payload: unknown): Promise<void> {
    console.log(`[multi-sub] audit.login:`, JSON.stringify(payload));
  }

  @subscribe('audit.logout')
  async onLogout(payload: unknown): Promise<void> {
    console.log(`[multi-sub] audit.logout:`, JSON.stringify(payload));
  }

  @post('/tasks')
  async submit(@requestBody() task: Task): Promise<{submitted: true}> {
    await this.pub.publish('tasks.work', task);
    return {submitted: true};
  }
}
