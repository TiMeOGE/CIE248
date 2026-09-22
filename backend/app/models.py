"""Modeles repris du prototype experimental, adaptes au nombre variable de QCM."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from .config import MAX_QUESTIONS, MIN_QUESTIONS

NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
SchoolLevel = Literal["primaire", "cycle", "9e", "10e", "11e"]


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    question: NonEmptyText
    choices: list[NonEmptyText] = Field(min_length=4, max_length=4)
    correct_answer: int = Field(ge=0, le=3)
    explanation: NonEmptyText

    @field_validator("choices")
    @classmethod
    def distinct_choices(cls, choices: list[str]) -> list[str]:
        if len({choice.casefold() for choice in choices}) != 4:
            raise ValueError("Les quatre choix doivent etre distincts.")
        return choices


class LLMQuiz(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    # Une liste vide permet au modele de signaler un cours insuffisant.
    questions: list[Question] = Field(max_length=MAX_QUESTIONS)


class Quiz(LLMQuiz):
    questions: list[Question] = Field(min_length=MIN_QUESTIONS, max_length=MAX_QUESTIONS)


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
