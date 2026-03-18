#![allow(dead_code)]

use std::fmt::Display;

pub type AppResult<T> = Result<T, String>;

pub fn into_error<E>(err: E) -> String
where
    E: Display,
{
    err.to_string()
}
