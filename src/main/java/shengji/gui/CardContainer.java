package shengji.gui;

import com.sun.istack.internal.NotNull;
import org.apache.log4j.Logger;
import shengji.logger.LogFactory;

import javax.swing.*;
import java.util.ArrayList;
import java.util.List;

public class CardContainer {

    private static Logger log = LogFactory.getLog(CardContainer.class);

    private int mBaseX = 0, mBaseY = 0;
    private JFrame mFrame;
    private List<CardImage> mList;

    public CardContainer(@NotNull JFrame frame) {
        this.mFrame = frame;
        mList = new ArrayList<CardImage>();
    }

    public void setBaseLocation(int x, int y) {
        mBaseX = x;
        mBaseY = y;
    }

    public void addCard(@NotNull CardImage card) {
        mList.add(card);
    }

    public void display() {
        int size = mList.size();
        log.info("" + size + " cards to display");

        int cumulativeX = mBaseX;
        for (int i = 0; i < size; i++) {
            CardImage card = mList.get(i);
            card.setLocation(cumulativeX, mBaseY);
            String logStr = String.format("Card %d at (%d, %d)", i, cumulativeX, mBaseY);
            log.info(logStr);
            cumulativeX += card.mIcon.getIconWidth();
            mList.set(i, card);
        }
        mFrame.setVisible(true);
    }
}
