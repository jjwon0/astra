import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceMemoJob } from './VoiceMemoJob';

vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({
    birthtime: new Date('2026-01-10T14:30:00'),
  }),
}));

vi.mock('../services/core/fileWatcher', () => ({
  FileWatcher: vi.fn().mockImplementation(() => ({
    watch: vi.fn(),
  })),
}));

vi.mock('../services/core/transcription', () => ({
  TranscriptionService: vi.fn().mockImplementation(() => ({
    transcribe: vi.fn(),
  })),
}));

vi.mock('../services/core/organization', () => ({
  OrganizationService: vi.fn().mockImplementation(() => ({
    organize: vi.fn(),
  })),
}));

vi.mock('../services/core/notionSync', () => ({
  NotionSyncService: vi.fn().mockImplementation(() => ({
    sync: vi.fn(),
  })),
}));

vi.mock('../services/core/journal', () => ({
  JournalService: vi.fn().mockImplementation(() => ({
    format: vi.fn(),
  })),
}));

vi.mock('../services/core/journalNotionSync', () => ({
  JournalNotionService: vi.fn().mockImplementation(() => ({
    syncEntry: vi.fn(),
  })),
}));

vi.mock('../utils/archive', () => ({
  ArchiveService: vi.fn().mockImplementation(() => ({
    archive: vi.fn(),
    archiveFailed: vi.fn(),
  })),
}));

import { FileWatcher } from '../services/core/fileWatcher';
import { TranscriptionService } from '../services/core/transcription';
import { OrganizationService } from '../services/core/organization';
import { NotionSyncService } from '../services/core/notionSync';
import { JournalService } from '../services/core/journal';
import { JournalNotionService } from '../services/core/journalNotionSync';
import { ArchiveService } from '../utils/archive';

describe('VoiceMemoJob Integration', () => {
  let job: VoiceMemoJob;
  let mockConfig: any;
  let mockState: any;
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      isJobProcessed: vi.fn().mockReturnValue(false),
      markJobCompleted: vi.fn(),
      markJobFailed: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockConfig = {
      getEnv: vi.fn().mockReturnValue({
        VOICE_MEMOS_DIR: '/voice_memos',
        GEMINI_API_KEY: 'test-gemini-key',
        NOTION_API_KEY: 'test-notion-key',
        ARCHIVE_DIR: '/archive',
        FAILED_DIR: '/failed',
        INVALID_DIR: '/invalid',
        MAX_RETRIES: '3',
      }),
      getSchema: vi.fn().mockReturnValue({
        todoDatabaseId: 'todo-db-id',
        noteDatabaseId: 'note-db-id',
        journalDatabaseId: 'journal-db-id',
        priorities: ['high', 'medium', 'low'],
        categories: ['work', 'personal', 'ideas'],
      }),
    };

    job = new VoiceMemoJob(mockConfig);
  });

  it('should successfully process a voice memo through the full pipeline', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/memo1.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'TODO: Buy groceries tomorrow morning',
    });
    mockOrganizationService.organize.mockResolvedValue({
      success: true,
      items: [
        {
          type: 'TODO',
          content: 'TODO: Buy groceries tomorrow morning',
          priority: 'medium',
          category: 'personal',
        },
      ],
    });
    mockNotionSyncService.sync.mockResolvedValue({
      success: true,
      itemsCreated: 1,
      itemsFailed: 0,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockFileWatcher.watch).toHaveBeenCalledWith(mockState, mockLogger);
    expect(mockTranscriptionService.transcribe).toHaveBeenCalledWith(
      '/voice_memos/memo1.m4a',
      mockLogger
    );
    expect(mockOrganizationService.organize).toHaveBeenCalledWith(
      'TODO: Buy groceries tomorrow morning',
      mockConfig.getSchema(),
      mockLogger
    );
    expect(mockNotionSyncService.sync).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TODO',
          content: 'TODO: Buy groceries tomorrow morning',
        }),
      ]),
      'memo1.m4a',
      expect.any(Date),
      mockLogger
    );
    expect(mockArchiveService.archive).toHaveBeenCalledWith('/voice_memos/memo1.m4a');
    expect(mockState.markJobCompleted).toHaveBeenCalledWith('voiceMemo', 'memo1.m4a');
    expect(mockState.markJobFailed).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('Successfully processed memo1.m4a');
  }, 10000);

  it('should process multiple files in sequence', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/memo1.m4a', '/voice_memos/memo2.wav']);
    mockTranscriptionService.transcribe
      .mockResolvedValueOnce({
        success: true,
        text: 'TODO: First task',
      })
      .mockResolvedValueOnce({
        success: true,
        text: 'NOTE: Second note',
      });
    mockOrganizationService.organize
      .mockResolvedValueOnce({
        success: true,
        items: [{ type: 'TODO', content: 'TODO: First task', priority: 'high', category: 'work' }],
      })
      .mockResolvedValueOnce({
        success: true,
        items: [{ type: 'NOTE', content: 'NOTE: Second note', category: 'personal' }],
      });
    mockNotionSyncService.sync.mockResolvedValue({
      success: true,
      itemsCreated: 1,
      itemsFailed: 0,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockTranscriptionService.transcribe).toHaveBeenCalledTimes(2);
    expect(mockOrganizationService.organize).toHaveBeenCalledTimes(2);
    expect(mockNotionSyncService.sync).toHaveBeenCalledTimes(2);
    expect(mockArchiveService.archive).toHaveBeenCalledTimes(2);
    expect(mockState.markJobCompleted).toHaveBeenCalledWith('voiceMemo', 'memo1.m4a');
    expect(mockState.markJobCompleted).toHaveBeenCalledWith('voiceMemo', 'memo2.wav');
  }, 10000);

  it('should handle transcription failure', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/fail.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: false,
      error: 'API error',
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockArchiveService.archive).not.toHaveBeenCalled();
    expect(mockArchiveService.archiveFailed).toHaveBeenCalledWith('/voice_memos/fail.m4a');
    expect(mockState.markJobFailed).toHaveBeenCalledWith(
      'voiceMemo',
      'fail.m4a',
      'Transcription failed: API error'
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process fail.m4a')
    );
  }, 10000);

  it('should handle organization failure', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/fail.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'TODO: Some task',
    });
    mockOrganizationService.organize.mockResolvedValue({
      success: false,
      error: 'Organization error',
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockArchiveService.archiveFailed).toHaveBeenCalledWith('/voice_memos/fail.m4a');
    expect(mockState.markJobFailed).toHaveBeenCalledWith(
      'voiceMemo',
      'fail.m4a',
      'Organization failed: Organization error'
    );
  }, 10000);

  it('should handle complete sync failure', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/fail.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'TODO: Some task',
    });
    mockOrganizationService.organize.mockResolvedValue({
      success: true,
      items: [{ type: 'TODO', content: 'Task', priority: 'medium', category: 'work' }],
    });
    mockNotionSyncService.sync.mockResolvedValue({
      success: false,
      itemsCreated: 1,
      itemsFailed: 1,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockArchiveService.archiveFailed).toHaveBeenCalledWith('/voice_memos/fail.m4a');
    expect(mockState.markJobFailed).toHaveBeenCalledWith(
      'voiceMemo',
      'fail.m4a',
      'Notion sync failed completely'
    );
  }, 10000);

  it('should handle partial sync success', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/partial.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'TODO: Multiple items',
    });
    mockOrganizationService.organize.mockResolvedValue({
      success: true,
      items: [
        { type: 'TODO', content: 'Task 1', priority: 'high', category: 'work' },
        { type: 'TODO', content: 'Task 2', priority: 'medium', category: 'personal' },
      ],
    });
    mockNotionSyncService.sync.mockResolvedValue({
      success: true,
      itemsCreated: 1,
      itemsFailed: 1,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockArchiveService.archive).toHaveBeenCalledWith('/voice_memos/partial.m4a');
    expect(mockState.markJobCompleted).toHaveBeenCalledWith('voiceMemo', 'partial.m4a');
    expect(mockLogger.warn).toHaveBeenCalledWith('Sync completed with 1 failure(s)');
  }, 10000);

  it('should skip files with no items', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/empty.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'TODO: Some task',
    });
    mockOrganizationService.organize.mockResolvedValue({
      success: true,
      items: [],
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockNotionSyncService.sync).not.toHaveBeenCalled();
    expect(mockArchiveService.archive).toHaveBeenCalledWith('/voice_memos/empty.m4a');
    expect(mockState.markJobCompleted).toHaveBeenCalledWith('voiceMemo', 'empty.m4a');
    expect(mockLogger.info).toHaveBeenCalledWith('No items found in empty.m4a, skipping sync');
  }, 10000);

  it('should return early when no new files are found', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue([]);

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockTranscriptionService.transcribe).not.toHaveBeenCalled();
    expect(mockOrganizationService.organize).not.toHaveBeenCalled();
    expect(mockNotionSyncService.sync).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('No new files to process');
  });

  it('should handle archive errors gracefully', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/fail.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'TODO: Some task',
    });
    mockOrganizationService.organize.mockResolvedValue({
      success: true,
      items: [{ type: 'TODO', content: 'Task', priority: 'medium', category: 'work' }],
    });
    mockNotionSyncService.sync.mockResolvedValue({
      success: true,
      itemsCreated: 1,
      itemsFailed: 0,
    });
    mockArchiveService.archive.mockImplementation(() => {
      throw new Error('Archive failed');
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockState.markJobCompleted).not.toHaveBeenCalled();
    expect(mockArchiveService.archiveFailed).toHaveBeenCalledWith('/voice_memos/fail.m4a');
    expect(mockState.markJobFailed).toHaveBeenCalledWith('voiceMemo', 'fail.m4a', 'Archive failed');
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to process fail.m4a: Archive failed');
  }, 10000);

  it('should mark failed files when archiveFailed fails', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/fail.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: false,
      error: 'API error',
    });
    mockArchiveService.archiveFailed.mockImplementation(() => {
      throw new Error('Archive failed');
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockState.markJobFailed).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to process fail.m4a: Transcription failed: API error'
    );
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to archive fail.m4a: Archive failed');
  }, 10000);

  it('should detect and process journal entries', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockJournalService = (JournalService as any).mock.results[0].value;
    const mockJournalNotionService = (JournalNotionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/journal.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'Journal, today I had a great day working on the new feature.',
    });
    mockJournalService.format.mockResolvedValue({
      success: true,
      formattedText: 'Today I had a great day working on the new feature.',
    });
    mockJournalNotionService.syncEntry.mockResolvedValue({
      success: true,
      pageId: 'journal-page-123',
      isNewPage: true,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockJournalService.format).toHaveBeenCalledWith(
      'today I had a great day working on the new feature.',
      mockLogger
    );
    expect(mockJournalNotionService.syncEntry).toHaveBeenCalledWith(
      'Today I had a great day working on the new feature.',
      expect.any(Date),
      mockLogger
    );
    expect(mockOrganizationService.organize).not.toHaveBeenCalled();
    expect(mockArchiveService.archive).toHaveBeenCalledWith('/voice_memos/journal.m4a');
    expect(mockState.markJobCompleted).toHaveBeenCalledWith('voiceMemo', 'journal.m4a');
    expect(mockLogger.info).toHaveBeenCalledWith('Detected journal entry in journal.m4a');
  }, 10000);

  it('should handle journal formatting failure', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockJournalService = (JournalService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/journal.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'Journal, some content here',
    });
    mockJournalService.format.mockResolvedValue({
      success: false,
      error: 'Formatting failed',
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockArchiveService.archiveFailed).toHaveBeenCalledWith('/voice_memos/journal.m4a');
    expect(mockState.markJobFailed).toHaveBeenCalledWith(
      'voiceMemo',
      'journal.m4a',
      'Journal formatting failed: Formatting failed'
    );
  }, 10000);

  it('should handle journal sync failure', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockJournalService = (JournalService as any).mock.results[0].value;
    const mockJournalNotionService = (JournalNotionService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/journal.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'Journal, some content',
    });
    mockJournalService.format.mockResolvedValue({
      success: true,
      formattedText: 'Some content',
    });
    mockJournalNotionService.syncEntry.mockResolvedValue({
      success: false,
      error: 'Sync failed',
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockArchiveService.archiveFailed).toHaveBeenCalledWith('/voice_memos/journal.m4a');
    expect(mockState.markJobFailed).toHaveBeenCalledWith(
      'voiceMemo',
      'journal.m4a',
      'Journal sync failed: Sync failed'
    );
  }, 10000);

  it('should route TODO prefix to organization, not journal', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;
    const mockJournalService = (JournalService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/memo.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'TODO: Buy groceries and check my journal later',
    });
    mockOrganizationService.organize.mockResolvedValue({
      success: true,
      items: [{ type: 'TODO', content: 'Buy groceries', priority: 'medium', category: 'personal' }],
    });
    mockNotionSyncService.sync.mockResolvedValue({
      success: true,
      itemsCreated: 1,
      itemsFailed: 0,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockJournalService.format).not.toHaveBeenCalled();
    expect(mockOrganizationService.organize).toHaveBeenCalled();
    expect(mockArchiveService.archive).toHaveBeenCalledWith('/voice_memos/memo.m4a');
  }, 10000);

  it('should strip journal keyword with various punctuation', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockJournalService = (JournalService as any).mock.results[0].value;
    const mockJournalNotionService = (JournalNotionService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/journal.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'JOURNAL: Today was productive.',
    });
    mockJournalService.format.mockResolvedValue({
      success: true,
      formattedText: 'Today was productive.',
    });
    mockJournalNotionService.syncEntry.mockResolvedValue({
      success: true,
      pageId: 'page-123',
      isNewPage: true,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockJournalService.format).toHaveBeenCalledWith('Today was productive.', mockLogger);
  }, 10000);

  it('should route non-prefixed text to journal by default', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockJournalService = (JournalService as any).mock.results[0].value;
    const mockJournalNotionService = (JournalNotionService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/memo.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'Saw a really cool temple today in Chaozhou',
    });
    mockJournalService.format.mockResolvedValue({
      success: true,
      formattedText: 'Saw a really cool temple today in Chaozhou.',
    });
    mockJournalNotionService.syncEntry.mockResolvedValue({
      success: true,
      pageId: 'page-123',
      isNewPage: true,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockJournalService.format).toHaveBeenCalled();
    expect(mockOrganizationService.organize).not.toHaveBeenCalled();
    expect(mockArchiveService.archive).toHaveBeenCalledWith('/voice_memos/memo.m4a');
  }, 10000);

  it('should detect "to do" with space as TODO', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;
    const mockJournalService = (JournalService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/memo.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'to do, buy milk tomorrow',
    });
    mockOrganizationService.organize.mockResolvedValue({
      success: true,
      items: [{ type: 'TODO', content: 'buy milk', priority: 'medium', category: 'personal' }],
    });
    mockNotionSyncService.sync.mockResolvedValue({
      success: true,
      itemsCreated: 1,
      itemsFailed: 0,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockOrganizationService.organize).toHaveBeenCalled();
    expect(mockJournalService.format).not.toHaveBeenCalled();
    expect(mockArchiveService.archive).toHaveBeenCalledWith('/voice_memos/memo.m4a');
  }, 10000);

  it('should detect NOTE prefix and route to organization', async () => {
    const mockFileWatcher = (FileWatcher as any).mock.results[0].value;
    const mockTranscriptionService = (TranscriptionService as any).mock.results[0].value;
    const mockOrganizationService = (OrganizationService as any).mock.results[0].value;
    const mockNotionSyncService = (NotionSyncService as any).mock.results[0].value;
    const mockJournalService = (JournalService as any).mock.results[0].value;
    const mockArchiveService = (ArchiveService as any).mock.results[0].value;

    mockFileWatcher.watch.mockResolvedValue(['/voice_memos/memo.m4a']);
    mockTranscriptionService.transcribe.mockResolvedValue({
      success: true,
      text: 'NOTE: interesting architecture pattern I noticed',
    });
    mockOrganizationService.organize.mockResolvedValue({
      success: true,
      items: [{ type: 'NOTE', content: 'architecture pattern', category: 'ideas' }],
    });
    mockNotionSyncService.sync.mockResolvedValue({
      success: true,
      itemsCreated: 1,
      itemsFailed: 0,
    });

    await job.execute(mockConfig, mockState, mockLogger);

    expect(mockOrganizationService.organize).toHaveBeenCalled();
    expect(mockJournalService.format).not.toHaveBeenCalled();
    expect(mockArchiveService.archive).toHaveBeenCalledWith('/voice_memos/memo.m4a');
  }, 10000);
});
