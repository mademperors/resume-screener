import type { TestingModuleBuilder } from '@nestjs/testing';
import { CandidateFlag } from './../src/candidates/evaluation.types.js';
import {
  ResumePreprocessor,
  ScoringEngine,
  ScreeningModel,
  TextExtractor,
  type ExtractedDocument,
  type PreparedResume,
  type ScoreResult,
  type ScoringConfig,
  type ScreeningInput,
  type ScreeningResult,
} from './../src/processing/stages.js';

/**
 * Simple stand-ins for the pipeline stages, so processing can be tested
 * before the real stages exist. Tests can queue errors per stage.
 *
 * The "resume" text format: first line is the name, the rest is matched
 * against skill names; `years: N` sets experience.
 */
export class FakeStages {
  readonly errors = {
    extract: [] as Error[],
    model: [] as Error[],
  };
  manipulation = false;
  /** Replaces the model result once, e.g. to return an invalid one. */
  nextModelResult: ScreeningResult | null = null;
  modelCalls: ScreeningInput[] = [];

  readonly extractor = new (class extends TextExtractor {
    constructor(private readonly stages: FakeStages) {
      super();
    }
    async extract(file: Buffer): Promise<ExtractedDocument> {
      const error = this.stages.errors.extract.shift();
      if (error) {
        throw error;
      }
      // Drop the PDF header line that makes the upload pass type detection.
      const text = file.toString('utf8').replace(/^%PDF-[^\n]*\n/, '');
      return { text, hiddenText: [] };
    }
  })(this);

  readonly preprocessor = new (class extends ResumePreprocessor {
    constructor(private readonly stages: FakeStages) {
      super();
    }
    async prepare(document: ExtractedDocument): Promise<PreparedResume> {
      const [name, ...rest] = document.text.split('\n');
      return {
        text: rest.join('\n'),
        contacts: {
          fullName: name.trim() || null,
          email: 'candidate@example.com',
          phone: null,
          location: null,
        },
        manipulationDetected: this.stages.manipulation,
        manipulationNotes: this.stages.manipulation ? ['hidden text'] : [],
      };
    }
  })(this);

  readonly model = new (class extends ScreeningModel {
    constructor(private readonly stages: FakeStages) {
      super();
    }
    async evaluate(input: ScreeningInput): Promise<ScreeningResult> {
      this.stages.modelCalls.push(input);
      const error = this.stages.errors.model.shift();
      if (error) {
        throw error;
      }
      if (this.stages.nextModelResult) {
        const result = this.stages.nextModelResult;
        this.stages.nextModelResult = null;
        return result;
      }
      const text = input.resumeText.toLowerCase();
      const years = Number(/years:\s*(\d+)/.exec(text)?.[1] ?? 0);
      const skills = input.requirements
        .filter(
          (r) => r.kind === 'skill' && text.includes(r.label.toLowerCase()),
        )
        .map((r) => r.label);
      return {
        modelName: 'fake-model',
        modelVersion: '1.0',
        skills,
        experienceYears: years,
        verdicts: input.requirements.map((r) => ({
          requirementId: r.id,
          met:
            r.kind === 'experience'
              ? years >= (r.minYears ?? 0)
              : skills.includes(r.label),
          confidence: 0.9,
        })),
      };
    }
  })(this);

  readonly scoring = new (class extends ScoringEngine {
    score(config: ScoringConfig, screening: ScreeningResult): ScoreResult {
      const byId = new Map(screening.verdicts.map((v) => [v.requirementId, v]));
      const total = config.requirements.reduce((sum, r) => sum + r.weight, 0);
      const contributions = config.requirements.map((r) => {
        const verdict = byId.get(r.id)!;
        const maxPoints = (100 * r.weight) / total;
        return {
          requirementId: r.id,
          label: r.label,
          mandatory: r.mandatory,
          weight: r.weight,
          met: verdict.met,
          confidence: verdict.confidence,
          maxPoints,
          points: verdict.met ? maxPoints * verdict.confidence : 0,
        };
      });
      const missing = contributions.filter((c) => !c.met);
      return {
        matchScore: contributions.reduce((sum, c) => sum + c.points, 0),
        contributions,
        flags: missing.some((c) => c.mandatory)
          ? [CandidateFlag.DoesNotMeetRequirements]
          : [],
        foundSkills: screening.skills,
        missingSkills: missing
          .filter((c) => c.requirementId.startsWith('skill:'))
          .map((c) => c.label),
      };
    }
  })();

  override(builder: TestingModuleBuilder): TestingModuleBuilder {
    return builder
      .overrideProvider(TextExtractor)
      .useValue(this.extractor)
      .overrideProvider(ResumePreprocessor)
      .useValue(this.preprocessor)
      .overrideProvider(ScreeningModel)
      .useValue(this.model)
      .overrideProvider(ScoringEngine)
      .useValue(this.scoring);
  }
}

/** A "resume" for FakeStages; detected as PDF by its header. */
export function fakeResume(name: string, body: string): Buffer {
  return Buffer.from(`%PDF-1.7\n${name}\n${body}`);
}
