int main(void) {
    volatile int i = 0;
    while (i < 10) { // BUG
        /* forgot to increment i */
    }
    return 0;
}
