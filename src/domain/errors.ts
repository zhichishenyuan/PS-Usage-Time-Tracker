export class MergeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeValidationError';
  }
}

export class UndoMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UndoMergeError';
  }
}

export class ProjectInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectInUseError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectNotFoundError';
  }
}
