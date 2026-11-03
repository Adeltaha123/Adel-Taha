import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { S } from '../data/store.js';
import { go } from '../shared/events.js';
import { defaultReminderPreferences, reminderPlan, type ReminderPreferences } from './reminder-plan';
import type { Task } from '../types/domain';
export const isNative = Capacitor.isNativePlatform();
export let reminderStatus = isNative ? 'Enable device reminders to schedule alerts.' : 'Browser reminders work while the app is running. Install a native build for scheduled device alerts.';
export function readPreferences(): ReminderPreferences {
  try { return { ...defaultReminderPreferences, ...JSON.parse(localStorage.getItem('mk_reminder_preferences') || '{}') }; } catch { return defaultReminderPreferences; }
}
let signature = ''; let timer: ReturnType<typeof setTimeout>; let queue = Promise.resolve();
const announce = () => document.dispatchEvent(new Event('mypa:cloud'));
export function savePreferences(preferences: ReminderPreferences) { localStorage.setItem('mk_reminder_preferences', JSON.stringify(preferences)); signature = ''; void updateReminders(); }
export function updateReminders() {
  queue = queue.catch(() => {}).then(async () => {
    if (!isNative) return;
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    const plan = reminderPlan([...S.items.values()].filter(x => x.kind === 'task') as Task[], readPreferences());
    const next = JSON.stringify(plan);
    if (next === signature) return;
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter(notification => notification.extra?.owner === 'my-pa');
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });
    const exact = Capacitor.getPlatform() === 'android' ? (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted' : true;
    if (plan.length) await LocalNotifications.schedule({ notifications: plan.map((item, index) => ({
      id: 100_000 + index, title: item.title, body: 'My PA · Task reminder',
      isExactNotification: exact,
      schedule: { at: item.at }, extra: { owner: 'my-pa', taskId: item.taskId },
    })) });
    signature = next; reminderStatus = `${plan.length} upcoming device reminders scheduled.${exact ? '' : ' Android may delay alerts; enable exact alarms in device settings for precise times.'}`; announce();
  }).catch(error => { reminderStatus = `Could not schedule reminders: ${String(error.message ?? error)}`; announce(); });
  return queue;
}
export async function enableDeviceReminders() {
  if (isNative) {
    const result = await LocalNotifications.requestPermissions();
    if (result.display !== 'granted') { reminderStatus = 'Notifications are blocked. Enable them in device settings.'; announce(); return; }
    signature = ''; await updateReminders();
  } else if ('Notification' in window) {
    const result = await Notification.requestPermission();
    reminderStatus = result === 'granted' ? 'Browser alerts enabled while the app is running.' : 'Notification permission was not granted.'; announce();
  }
}
export function initializeReminders() {
  document.documentElement.dataset.nativeNotifications = String(isNative);
  if (!isNative) return;
  document.addEventListener('mypa:render', () => { clearTimeout(timer); timer = setTimeout(() => void updateReminders(), 500); });
  document.addEventListener('mypa:enable-reminders', () => void enableDeviceReminders());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { signature = ''; void updateReminders(); } });
  void LocalNotifications.addListener('localNotificationActionPerformed', () => go('tasks'));
  void updateReminders();
}
